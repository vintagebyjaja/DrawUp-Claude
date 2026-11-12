/* DrawUp Specs v29: text resolution, page layout and export (PDF through pdf-lib, Word .docx through JSZip).
   One layout feeds the on-screen page preview (rendered with pdf.js) and the PDF, so what you see is what prints.
   Formats: the DrawUp format (DRAWUP_FORMAT below), the firm standard format and client formats share one
   settings shape. A format may carry a PDF letterhead (drawn under the page) and a Word template (.docx) whose
   styles, headers and footers are kept when exporting to Word.
   window.DrawUpSpecsExport = { pageSize, PAGES, DRAWUP_FORMAT, fixFormat, resolve, flatten, layout, pdf, docx, readDocxText, readPdfText, parseSpecText } */
(function () {
'use strict';
if (window.DrawUpSpecsExport) return;

const VENDOR = { pdflib: '/vendor/pdf-lib-1.17.1.min.js', pptx: '/vendor/pptxgenjs-4.0.1.bundle.js', pdfjs: '/vendor/pdfjs-3.11.174/pdf.min.js', pdfjsWorker: '/vendor/pdfjs-3.11.174/pdf.worker.min.js' };
const scripts = {};
function loadScript(src) { if (!scripts[src]) scripts[src] = new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete scripts[src]; no(new Error('A DrawUp file tool could not load. Check your connection and try again.')); }; document.head.appendChild(s); }); return scripts[src]; }
async function pdfLib() { if (!window.PDFLib) await loadScript(VENDOR.pdflib); return window.PDFLib; }
async function zipLib() { if (!window.JSZip) await loadScript(VENDOR.pptx); if (!window.JSZip) throw new Error('The Word tools could not load.'); return window.JSZip; }
async function pdfjs() { if (!window.pdfjsLib) await loadScript(VENDOR.pdfjs); window.pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR.pdfjsWorker; return window.pdfjsLib; }

const PAGES = { letter: [8.5, 11, 'Letter (8.5 × 11 in.)'], legal: [8.5, 14, 'Legal (8.5 × 14 in.)'], a4: [8.27, 11.69, 'A4 (210 × 297 mm)'] };
const FONTS = { Helvetica: ['Helvetica', 'HelveticaBold', 'Arial', 'Helvetica / Arial'], Times: ['TimesRoman', 'TimesRomanBold', 'Times New Roman', 'Times / Times New Roman'], Courier: ['Courier', 'CourierBold', 'Courier New', 'Courier'] };
// The DrawUp format: CSI SectionFormat and PageFormat conventions, DrawUp letterhead for letters.
/* v30: the DrawUp standard layout follows the Division 01 set a member uploaded (KEi Architects): a bold four-line
   project block with a rule under it, "SECTION 01 1000" and the title centered, PART 1 - GENERAL, articles numbered
   1.01, paragraphs A. / 1. / a., Arial 9 pt, and a footer rule with the section title on the left and
   "01 1000 - Page 1 of 4" on the right (pages counted per section). It is the default until a firm saves its own
   standard. Formats saved before v30 keep the v29 look: anything they do not set comes from LEGACY_FORMAT. */
const DRAWUP_FORMAT = {
  name: 'DrawUp standard', standard: 'drawup-v30', page: 'letter', margins: { t: 0.5, r: 0.7, b: 0.5, l: 1 }, font: 'Helvetica', size: 9, line: 1.25, accent: '#000000',
  numbering: 'csi', indent: 0.55, caps_articles: true, article_style: '01', number_style: 'compact', part_style: 'PART {n} - {title}', section_title: 'SECTION {number}\n{title}', end_text: 'END OF SECTION {number}',
  header: { block: '<<owner_name>>\n<<project_name>>\n<<architect_name>> Project Number:\t<<project_number>>\nOwner Project Number:\t<<owner_project_number>>', left: '', right: '', rule: true, bold: true },
  footer: { left: '{section_title}', center: '', right: '{section_number} - Page {page_total} of {pages}', rule: true, bold: true },
  letter_footer: { left: '<<firm_name>>', center: '', right: 'Page {page} of {pages}' },
  letterhead: { show: true, logo: 'firm', align: 'left', lines: '<<firm_name>>\n<<architect_address>>' },
  cover: true, toc: true, background: null, word_template: null, label: 'DrawUp'
};
const LEGACY_FORMAT = {
  name: 'DrawUp format', page: 'letter', margins: { t: 0.75, r: 1, b: 0.75, l: 1 }, font: 'Helvetica', size: 10, line: 1.3, accent: '#13233d',
  numbering: 'csi', indent: 0.5, caps_articles: true, article_style: '1', number_style: 'spaced', part_style: 'PART {n} - {title}', section_title: 'SECTION {number}\n{title}', end_text: 'END OF SECTION {number}',
  header: { block: '', left: '<<project_name>>', right: '<<project_number>>', rule: false, bold: false },
  footer: { left: '<<issue_purpose>>', center: '{section_title} {section_number} - {page}', right: '<<issue_date>>', rule: false, bold: false },
  letter_footer: { left: '<<firm_name>>', center: '', right: 'Page {page} of {pages}' },
  letterhead: { show: true, logo: 'firm', align: 'left', lines: '<<firm_name>>\n<<architect_address>>' },
  cover: true, toc: true, background: null, word_template: null, label: 'DrawUp'
};
/** "01 10 00" written the way the format writes section numbers ("01 1000" in the DrawUp standard). Display only. */
function showNumber(n, fmt) { const s = String(n || ''); return fmt && fmt.number_style === 'compact' ? s.replace(/^(\d{2}) (\d{2}) (\d{2})/, '$1 $2$3') : s; }
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
/* v30 Document Studio: page size with orientation. Landscape swaps width and height everywhere (preview, PDF
   and Word), so one setting drives all three. */
function pageSize(fmt) { const [w, h] = PAGES[(fmt && fmt.page) || 'letter'] || PAGES.letter; return (fmt && fmt.orientation === 'landscape') ? [h, w] : [w, h]; }
function fixFormat(s) {
  s = isObj(s) ? s : {};
  // no settings, or settings made from the v30 standard: the DrawUp standard. Saved firm and client formats from
  // before v30 keep their look (their unset keys come from the v29 layout).
  const d = !Object.keys(s).length || s.standard === 'drawup-v30' ? DRAWUP_FORMAT : LEGACY_FORMAT;
  const o = { ...d, ...s };
  ['margins', 'header', 'footer', 'letter_footer', 'letterhead'].forEach(k => { o[k] = { ...d[k], ...(isObj(s[k]) ? s[k] : {}) }; });
  if (o.footer.right === '{section_number} - Page {page} of {section_pages}') o.footer.right = DRAWUP_FORMAT.footer.right; // v31: pages count through the whole book
  if (!PAGES[o.page]) o.page = 'letter'; if (!FONTS[o.font]) o.font = 'Helvetica';
  if (!['portrait', 'landscape'].includes(o.orientation)) o.orientation = 'portrait';
  o.size = Math.min(14, Math.max(7, +o.size || 10)); o.line = Math.min(2, Math.max(1, +o.line || 1.3)); o.indent = Math.min(1, Math.max(0.2, +o.indent || 0.5));
  ['t', 'r', 'b', 'l'].forEach(k => { o.margins[k] = Math.min(2.5, Math.max(0.25, +o.margins[k] || d.margins[k])); });
  if (!/^#[0-9a-f]{6}$/i.test(o.accent || '')) o.accent = d.accent; if (!['csi', 'decimal'].includes(o.numbering)) o.numbering = 'csi'; if (!['1', '01'].includes(String(o.article_style))) o.article_style = d.article_style; if (!['spaced', 'compact'].includes(o.number_style)) o.number_style = d.number_style;
  return o;
}

/* ------------------------------------------------------------------ text markup
   {{Label}} blank, {{Label=value}} filled, [[a|*b]] choice, <<key>> project data */
const TOKEN = /\{\{([^{}]*?)\}\}|\[\[([^\[\]]*?)\]\]|<<([a-z0-9_]+)>>/g;
function tokens(text) { const out = []; let last = 0, m; TOKEN.lastIndex = 0; const s = String(text || ''); while ((m = TOKEN.exec(s))) { if (m.index > last) out.push({ t: 'txt', v: s.slice(last, m.index) }); if (m[1] != null) { const i = m[1].indexOf('='); out.push(i < 0 ? { t: 'blank', label: m[1] } : { t: 'blank', label: m[1].slice(0, i), value: m[1].slice(i + 1) }); } else if (m[2] != null) { const opts = m[2].split('|'); out.push({ t: 'opt', opts: opts.map(o => o.replace(/^\*/, '')), sel: opts.findIndex(o => o.startsWith('*')) }); } else out.push({ t: 'data', key: m[3] }); last = TOKEN.lastIndex; } if (last < s.length) out.push({ t: 'txt', v: s.slice(last) }); return out; }
function untokens(list) { return list.map(k => k.t === 'txt' ? k.v : k.t === 'blank' ? '{{' + k.label + (k.value != null && k.value !== '' ? '=' + k.value : '') + '}}' : k.t === 'opt' ? '[[' + k.opts.map((o, i) => (i === k.sel ? '*' : '') + o).join('|') + ']]' : '<<' + k.key + '>>').join(''); }
// ctx.data: project data and auto tokens. ctx.draft: show missing values in brackets (true) or as blanks.
function resolve(text, ctx) {
  const D = (ctx && ctx.data) || {}, labels = (ctx && ctx.labels) || {};
  return tokens(text).map(k => {
    if (k.t === 'txt') return k.v;
    if (k.t === 'blank') return k.value != null && k.value !== '' ? k.value : '[' + k.label + ']';
    if (k.t === 'opt') return k.sel >= 0 ? k.opts[k.sel] : '[' + k.opts.join(' / ') + ']';
    const v = D[k.key]; return v != null && String(v).trim() !== '' ? String(v) : '[' + (labels[k.key] || k.key.replace(/_/g, ' ')) + ']';
  }).join('');
}
function openItems(text, ctx) { const D = (ctx && ctx.data) || {}; let n = 0; tokens(text).forEach(k => { if (k.t === 'blank' && !(k.value != null && k.value !== '')) n++; else if (k.t === 'opt' && k.sel < 0) n++; else if (k.t === 'data' && !(D[k.key] != null && String(D[k.key]).trim())) n++; }); return n; }
function fill(tpl, vars) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? String(vars[k]) : m); }

/* ------------------------------------------------------------------ numbering */
const ALPHA = n => { let s = ''; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
function paraLabels(paras, numbering, art) { // CSI: A. 1. a. 1) ; decimal: 1.1.1, 1.1.1.1
  const c = [0, 0, 0, 0], out = [];
  paras.forEach(p => { if (p.off || p.plain) { out.push(''); return; } const l = Math.min(3, Math.max(0, p.lvl | 0)); c[l]++; for (let i = l + 1; i < 4; i++) c[i] = 0;
    if (numbering === 'decimal') out.push(art + '.' + c.slice(0, l + 1).join('.'));
    else out.push(l === 0 ? ALPHA(c[0] - 1) + '.' : l === 1 ? c[1] + '.' : l === 2 ? String.fromCharCode(96 + ((c[2] - 1) % 26) + 1) + '.' : c[3] + ')'); });
  return out;
}
const PART_TITLES = { 1: 'GENERAL', 2: 'PRODUCTS', 3: 'EXECUTION' };

/* ------------------------------------------------------------------ v30: seals and signatures on a document
   doc.data.marks: [{ id, kind: 'seal'|'signature', img: 'data:image/png;base64,…', w, h, name, role, at, by }]
   Each one was applied by the person it belongs to (see drawup-doc-marks-v30.js). Exports place them as images
   with the person's name and the date they were applied. */
function marksOf(doc) { const m = doc && doc.data && Array.isArray(doc.data.marks) ? doc.data.marks : []; return m.filter(x => x && /^data:image\/(png|jpeg);base64,/.test(x.img || '') && x.w > 0 && x.h > 0); }
function markBox(m) { const maxW = m.kind === 'seal' ? 1.6 : 2.4, maxH = m.kind === 'seal' ? 1.6 : 0.75; const r = Math.min(maxW / m.w, maxH / m.h); return [m.w * r, m.h * r]; } // inches
function markCaption(m) { const d = m.at ? new Date(m.at) : null; const ds = d && !isNaN(d) ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''; return [m.name || '', m.role || '', (m.kind === 'seal' ? 'Sealed ' : 'Signed ') + ds].filter(x => String(x).trim()); }
function dataBytes(u) { const b = atob(String(u).split(',')[1] || ''); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }

/* ------------------------------------------------------------------ flatten a document into blocks
   Block types: h (heading), p (paragraph with optional hanging label), table, fields, break, rule, toc */
function flatten(doc, ctx, fmt, opts) {
  fmt = fixFormat(fmt); opts = opts || {}; const out = [], R = t => resolve(t, ctx);
  const only = opts.sectionId;
  if ((doc.kind || 'spec') === 'spec') {
    const secs = (doc.sections || []).filter(s => s.state !== 'excluded' && (!only || s.id === only)).slice().sort((a, b) => String(a.number).localeCompare(String(b.number)));
    if (!only && fmt.cover) {
      out.push({ t: 'cover', title: R(doc.title || 'Project Manual'), lines: [R('<<project_name>>'), R('<<project_address>>'), '', 'Project no. ' + R('<<project_number>>'), R('<<issue_purpose>>'), R('<<issue_date>>'), '', R('<<architect_name>>'), R('<<architect_address>>')].filter((x, i, a) => !(x === '' && a[i - 1] === '')), section: { number: '', title: '' } });
      out.push({ t: 'break', section: { number: '00 01 10', title: 'TABLE OF CONTENTS' } });
    }
    if (!only && fmt.toc) {
      out.push({ t: 'h', text: 'TABLE OF CONTENTS', align: 'center', bold: true, after: 12, section: { number: '00 01 10', title: 'TABLE OF CONTENTS' } });
      let div = '';
      secs.forEach(s => { const d = String(s.number).slice(0, 2); if (d !== div) { div = d; out.push({ t: 'h', text: 'DIVISION ' + d + ' - ' + ((window.DrawUpSpecsData && window.DrawUpSpecsData.DIVISIONS[d]) || '').toUpperCase(), bold: true, before: 8, after: 4 }); } out.push({ t: 'toc', number: showNumber(s.number, fmt), title: R(s.title).toUpperCase() }); });
    }
    // v30: seals and signatures applied to this manual get their own page before the first section
    const mk = marksOf(doc);
    if (!only && mk.length) { const ms = { number: '00 01 07', title: 'SEALS PAGE' }; out.push(out.length ? { t: 'break', section: ms, restart: true } : { t: 'mark', section: ms, restart: true }); out.push({ t: 'h', text: 'SEALS AND SIGNATURES', align: 'center', bold: true, after: 14, size: fmt.size + 1, style: 'Title' }); out.push({ t: 'marks', items: mk }); }
    secs.forEach((s, si) => {
      const sec = { number: showNumber(s.number, fmt), title: R(s.title).toUpperCase() };
      if (out.length) out.push({ t: 'break', section: sec, restart: true }); else out.push({ t: 'mark', section: sec, restart: true });
      // v30 imports: notes that sat above the SECTION line in the source (for example editor's notes) stay above it
      const lead = (((s.parts || {})[1] || [])[0] || {}).lead ? s.parts[1][0] : null;
      if (lead && !lead.off) (lead.paras || []).filter(p => !p.off).forEach(p => R(p.t).split('\n').forEach(line => out.push({ t: 'p', label: '', text: line, lvl: 0, after: 4 })));
      fill(fmt.section_title, { number: sec.number, title: sec.title }).split('\n').forEach((line, i) => out.push({ t: 'h', text: line, align: 'center', bold: true, after: i ? 14 : 2, size: fmt.size + 1, style: 'Title' }));
      [1, 2, 3].forEach(n => {
        const part = (s.parts || {})[n] || [];
        if (doc.outline && n !== 2 && !part.length) return;
        if (s.front && !part.filter(a => !a.lead).length) return;
        // v30 imports: a part title the source used (for example PART 2 - MATERIALS) is kept; front matter has no PART line
        if (!s.front) out.push({ t: 'h', text: fill(fmt.part_style, { n, title: (s.part_titles && s.part_titles[n]) || PART_TITLES[n] }), bold: true, before: n === 1 ? 4 : 14, after: 8, keep: true, style: 'Heading1' });
        let ai = 0;
        part.filter(a => !a.off && !a.lead).forEach(a => {
          // v30 imports: text that came before the first article (notes, schedules) has no article line or number
          const titled = !a.untitled || String(a.title || '').trim();
          if (titled) ai++;
          const num = n + '.' + (String(fmt.article_style) === '01' ? String(Math.max(ai, 1)).padStart(2, '0') : Math.max(ai, 1));
          if (titled) out.push({ t: 'p', label: num, text: fmt.caps_articles ? R(a.title).toUpperCase() : R(a.title), lvl: -1, bold: true, before: 8, after: 4, keep: true, style: 'Heading2' });
          const paras = (a.paras || []).filter(p => !p.off), labs = paraLabels(paras, fmt.numbering, num);
          paras.forEach((p, pi) => R(p.t).split('\n').forEach((line, li, all) => out.push({ t: 'p', label: li ? '' : labs[pi], text: line, lvl: Math.min(3, p.lvl | 0), after: li === all.length - 1 ? 4 : 0 })));
        });
      });
      if (!s.front) out.push({ t: 'h', text: fill(fmt.end_text, { number: sec.number, title: sec.title }), align: 'center', bold: true, before: 18 });
    });
    return out;
  }
  // letter-type documents
  const sec = { number: doc.doc_number || '', title: R(doc.title || '') };
  out.push({ t: 'letterhead', section: sec });
  out.push({ t: 'h', text: R(doc.heading || doc.type_label || doc.title || '').toUpperCase(), bold: true, size: fmt.size + 4, after: 2, accent: true, style: 'Title' });
  if (doc.doc_number) out.push({ t: 'p', text: 'No. ' + R(doc.doc_number), after: 6, lvl: -2 });
  out.push({ t: 'rule', after: 8 });
  const fields = (doc.fields || []).filter(f => String(f.v || '').trim() !== '' || f.keep);
  if (fields.length) out.push({ t: 'fields', rows: fields.map(f => [R(f.label), R(f.v)]), after: 10 });
  (doc.blocks || []).forEach(b => {
    if (b.off) return;
    if (b.h) out.push({ t: 'h', text: R(b.h), bold: true, before: 8, after: 4, keep: true, style: 'Heading2' });
    if (b.table) out.push({ t: 'table', cols: b.table.cols.map(R), rows: (b.table.rows || []).map(r => r.map(R)), after: 8 });
    else String(b.p || '').split('\n').forEach((line, i, all) => out.push({ t: 'p', text: R(line), lvl: -2, after: i === all.length - 1 ? 8 : 0, blank: !line.trim() }));
  });
  const mk = marksOf(doc); if (mk.length) { out.push({ t: 'h', text: 'Signed and sealed', bold: true, before: 14, after: 6, keep: true, style: 'Heading2' }); out.push({ t: 'marks', items: mk }); } // v30
  return out;
}

/* ------------------------------------------------------------------ page layout (points) */
function wrap(text, maxW, width) { const out = []; const words = String(text).split(/(\s+)/); let line = ''; for (const w of words) { if (!w) continue; const tryLine = line + w; if (width(tryLine.trimEnd()) <= maxW || !line.trim()) { if (width(tryLine.trimEnd()) > maxW && !line.trim()) { let chunk = ''; for (const ch of w) { if (width(chunk + ch) > maxW && chunk) { out.push(chunk); chunk = ''; } chunk += ch; } line = chunk; } else line = tryLine; } else { out.push(line.trimEnd()); line = w.trimStart(); } } out.push(line.trimEnd()); return out.length ? out : ['']; }
// metrics(font, bold) -> (text, size) => width in points
function layout(blocks, fmt, metrics, ctx) {
  fmt = fixFormat(fmt); const [pw, ph] = pageSize(fmt); const W = pw * 72, H = ph * 72, M = fmt.margins;
  const hb = String((fmt.header && fmt.header.block) || '').split('\n').filter(x => x.trim()).length, fsz = fmt.size;
  const hdrH = hb ? hb * fsz * 1.2 + 26 : 22, ftrH = fmt.footer && fmt.footer.rule ? 30 : 22;
  const L = M.l * 72, Rt = W - M.r * 72, top = H - M.t * 72 - hdrH, bottom = M.b * 72 + ftrH, CW = Rt - L, size = fmt.size, lh = size * fmt.line, IND = fmt.indent * 72;
  const pages = []; let pg = null, y = 0, sec = { number: '', title: '' }, secPage = 0, isLetter = false;
  const newPage = () => { pg = { items: [], section: { ...sec }, secPage: ++secPage, letter: isLetter }; pages.push(pg); y = top; };
  const ensure = h => { if (!pg) newPage(); if (y - h < bottom) newPage(); };
  const text = (x, t, o) => pg.items.push({ k: 'text', x, y, t, size: o.size || size, bold: !!o.bold, color: o.color || '#000000' });
  const wfn = (bold, sz) => s => metrics(bold)(s, sz);
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    if (b.section) sec = { ...b.section };
    if (b.t === 'mark') { if (b.restart) secPage = 0; continue; }
    if (b.t === 'break') { if (b.restart) secPage = 0; newPage(); continue; }
    if (b.t === 'letterhead') { isLetter = true; if (!pg) newPage(); pg.letter = true; pg.letterhead = true; y = top - (fmt.letterhead.show ? 64 : 0); continue; }
    if (b.t === 'cover') { if (!pg) newPage(); pg.cover = true; y = top - H * 0.18; const ts = size * 2.2; wrap(b.title, CW, wfn(true, ts)).forEach(l => { text(L, l, { size: ts, bold: true, color: fmt.accent }); y -= ts * 1.2; }); y -= 10; pg.items.push({ k: 'line', x1: L, x2: L + 96, y: y + 4, w: 3, color: fmt.accent }); y -= 18; b.lines.forEach(l => { text(L, l, { size: size + 2 }); y -= (size + 2) * 1.45; }); continue; }
    const sz = b.size || size, bh = sz * fmt.line;
    if (b.before && pg && y !== top) y -= b.before;
    if (b.t === 'rule') { ensure(6); pg.items.push({ k: 'line', x1: L, x2: Rt, y: y + 2, w: 1.2, color: fmt.accent }); y -= (b.after || 6); continue; }
    if (b.t === 'h') {
      const lines = wrap(b.text, CW, wfn(b.bold, sz)); const need = lines.length * bh + (b.keep ? lh * 2 : 0); ensure(need);
      lines.forEach(l => { const w = metrics(b.bold)(l, sz); const x = b.align === 'center' ? L + (CW - w) / 2 : L; text(x, l, { size: sz, bold: b.bold, color: b.accent ? fmt.accent : '#000000' }); y -= bh; });
      y -= b.after || 0; continue;
    }
    if (b.t === 'toc') { ensure(lh); text(L + IND * 0.2, b.number, { size }); const t = wrap(b.title, CW - IND * 2.4, wfn(false, size)); t.forEach((l, i) => { if (i) ensure(lh); text(L + IND * 2.4, l, { size }); y -= lh; }); continue; }
    if (b.t === 'p') {
      if (b.blank) { y -= lh * 0.8; continue; }
      const lvl = b.lvl; let labX, textX;
      if (lvl === -2) { labX = L; textX = L; } else if (lvl === -1) { labX = L; textX = L + IND; } else { labX = L + IND * (lvl + 1); textX = labX + IND; }
      const lines = wrap(b.text, Rt - textX, wfn(b.bold, sz)); ensure(bh * Math.min(lines.length, 2) + (b.keep ? lh * 2 : 0));
      if (b.label && lvl !== -2) text(labX, b.label, { size: sz, bold: b.bold });
      lines.forEach((l, i) => { if (i) ensure(bh); text(textX, l, { size: sz, bold: b.bold }); y -= bh; });
      y -= b.after || 0; continue;
    }
    if (b.t === 'marks') { // v30: images in a row, each with its caption
      const per = Math.max(1, Math.min(3, Math.floor(CW / (2.2 * 72)))), cellW = CW / per;
      for (let i = 0; i < b.items.length; i += per) { // images sit on one baseline, captions line up under them
        const row = b.items.slice(i, i + per).map(m => { const [wi, hi] = markBox(m); const k = Math.min(1, (cellW - 14) / (wi * 72)); return { m, w: wi * 72 * k, h: hi * 72 * k, cap: markCaption(m) }; });
        const ih = Math.max(...row.map(r => r.h)), need = ih + Math.max(...row.map(r => r.cap.length)) * lh + 18; ensure(need); const top0 = y;
        row.forEach((r, ci) => { const cx = L + ci * cellW; pg.items.push({ k: 'img', x: cx, y: top0 - ih, w: r.w, h: r.h, src: r.m.id }); let yy = top0 - ih - 6; r.cap.forEach((c, k) => { pg.items.push({ k: 'text', x: cx, y: yy, t: c, size: k ? size - 1 : size, bold: !k, color: '#000000' }); yy -= lh; }); });
        y = top0 - need;
      }
      y -= 6; continue;
    }
    if (b.t === 'fields') { const lw = Math.min(130, CW * 0.28); b.rows.forEach(([k, v]) => { const lines = wrap(v, CW - lw, wfn(false, size)); ensure(lh * lines.length); text(L, k.toUpperCase(), { size: size - 1.5, bold: true, color: '#475569' }); lines.forEach(l => { text(L + lw, l, { size }); y -= lh; }); y -= 2; }); y -= b.after || 0; continue; }
    if (b.t === 'table') {
      const n = b.cols.length, pad = 4, ts = size - 0.5, tl = ts * 1.25;
      const weight = c => /^(no\.?|item|copies|pass|fail|done|date|rev(ision)?|workers|hours|due)$/i.test(c.trim()) ? 0.55 : /comment|observation|item$|finding|discussion|description|work performed|check$|title/i.test(c) ? 2.4 : 1.2;
      const ws = b.cols.map(weight), tot = ws.reduce((a, c) => a + c, 0), cw = ws.map(w => CW * w / tot);
      const xs = cw.reduce((a, w, i) => (a.push(a[i] + w), a), [L]);
      const row = (cells, head) => { const wrapped = cells.map((c, i) => wrap(c || '', cw[i] - pad * 2, wfn(head, ts))); const rh = Math.max(1, ...wrapped.map(w => w.length)) * tl + pad * 2; return { wrapped, rh, head }; };
      const drawRow = r => { pg.items.push({ k: 'rect', x: L, y: y - r.rh, w: CW, h: r.rh, fill: r.head ? '#eef2f7' : null, stroke: '#94a3b8' }); for (let i = 1; i < n; i++) pg.items.push({ k: 'line', x1: xs[i], x2: xs[i], y: y, y2: y - r.rh, w: 0.6, color: '#94a3b8' }); r.wrapped.forEach((lines, i) => lines.forEach((l, j) => pg.items.push({ k: 'text', x: xs[i] + pad, y: y - pad - j * tl, t: l, size: ts, bold: r.head, color: '#000000' }))); y -= r.rh; };
      const head = row(b.cols, true); ensure(head.rh + tl * 2 + pad * 2); drawRow(head);
      (b.rows.length ? b.rows : [b.cols.map(() => '')]).forEach(cells => { const r = row(cells, false); if (y - r.rh < bottom) { newPage(); drawRow(head); } drawRow(r); });
      y -= (b.after || 6); continue;
    }
  }
  if (!pages.length) newPage();
  // header and footer
  const total = pages.length, D = (ctx && ctx.data) || {}; const R = t => resolve(t, { data: D, labels: ctx && ctx.labels });
  // section page counts for {pages} in a section
  const secTotals = []; let run = []; pages.forEach(p => { if (p.secPage === 1 && run.length) { run.forEach(q => secTotals.push(run.length)); run = []; } run.push(p); }); run.forEach(() => secTotals.push(run.length));
  pages.forEach((p, i) => {
    if (p.cover) return;
    const vars = { page: p.secPage, pages: total, section_pages: secTotals[i] || 1, page_total: i + 1, section_number: p.section.number, section_title: p.section.title };
    const hdr = p.letter ? { left: '', right: '' } : fmt.header, ftr = p.letter ? fmt.letter_footer : fmt.footer;
    const hfBold = o => !!(o && o.bold), hfColor = o => o && o.bold ? '#000000' : '#334155', hfSize = o => o && o.bold ? size : size - 2;
    const put = (str, where, yy, sz2, o) => { const s = R(fill(str, p.letter ? { ...vars, page: i + 1 } : vars)).replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim(); if (!s || /^-\s*\d*$/.test(s)) return; const w = metrics(hfBold(o))(s, sz2); const x = where === 'left' ? L : where === 'right' ? Rt - w : L + (CW - w) / 2; p.items.push({ k: 'text', x, y: yy, t: s, size: sz2, bold: hfBold(o), color: hfColor(o) }); };
    if (!(p.letter && p.letterhead)) {
      const block = p.letter ? '' : String(hdr.block || '');
      if (block.trim()) { // the project block: one line each, a tab lines the value up
        let yy = H - M.t * 72 - size; const tabX = L + 1.6 * 72;
        block.split('\n').forEach(line => { const [a, b] = line.split('\t'); const ra = R(a || '').replace(/\[[^\]]*\]/g, '').trim(), rb = b != null ? R(b).replace(/\[[^\]]*\]/g, '').trim() : null; if (!ra && !rb) return;
          p.items.push({ k: 'text', x: L, y: yy, t: ra, size, bold: !!hdr.bold, color: '#000000' }); if (rb) p.items.push({ k: 'text', x: Math.max(tabX, L + metrics(!!hdr.bold)(ra, size) + 8), y: yy, t: rb, size, bold: !!hdr.bold, color: '#000000' }); yy -= size * 1.2; });
        if (hdr.rule) p.items.push({ k: 'line', x1: L, x2: Rt, y: yy + size * 0.2 - 3, w: 0.9, color: '#000000' });
      } else { put(hdr.left, 'left', H - M.t * 72, hfSize(hdr), hdr); put(hdr.right, 'right', H - M.t * 72, hfSize(hdr), hdr); if (hdr.rule && !p.letter) p.items.push({ k: 'line', x1: L, x2: Rt, y: H - M.t * 72 - 5, w: 0.9, color: '#000000' }); }
    }
    const fo = p.letter ? null : ftr;
    if (fo && fo.rule) p.items.push({ k: 'line', x1: L, x2: Rt, y: M.b * 72 + hfSize(fo) + 2, w: 0.9, color: '#000000' });
    put(ftr.left, 'left', M.b * 72, hfSize(fo), fo); put(ftr.center, 'center', M.b * 72, hfSize(fo), fo); put(ftr.right, 'right', M.b * 72, hfSize(fo), fo);
    if (p.letter && p.letterhead && fmt.letterhead.show) {
      const lines = R(fmt.letterhead.lines || '').split('\n').map(s => s.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean);
      p.lh = { lines, x: L, xr: Rt, y: H - M.t * 72, align: fmt.letterhead.align, logo: fmt.letterhead.logo };
      p.items.push({ k: 'line', x1: L, x2: Rt, y: H - M.t * 72 - 58, w: 0.8, color: '#cbd5e1' });
    }
  });
  return { W, H, pages, fmt };
}

/* ------------------------------------------------------------------ PDF */
const hex = (P, h) => { const n = parseInt(String(h || '#000000').slice(1), 16); return P.rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
const ASCII = { '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '✓': 'x', '✔': 'x', '−': '-', '‑': '-', '‐': '-', ' ': ' ', ' ': ' ', ' ': ' ', '′': "'", '″': '"', '≈': '~', '≠': '!=', '∞': 'inf', '·': '·' };
async function pdf(doc, ctx, fmt, files, opts) {
  const P = await pdfLib(); fmt = fixFormat(fmt);
  const out = await P.PDFDocument.create(); out.setTitle(resolve(doc.title || 'Document', ctx)); out.setAuthor(((ctx && ctx.data) || {}).firm_name || 'DrawUp'); out.setCreator('DrawUp Specs');
  const [fn, fb] = FONTS[fmt.font]; const reg = await out.embedFont(P.StandardFonts[fn]), bold = await out.embedFont(P.StandardFonts[fb]);
  const okSet = new Set(reg.getCharacterSet()); const clean = s => Array.from(String(s)).map(ch => okSet.has(ch.codePointAt(0)) ? ch : (ASCII[ch] != null ? ASCII[ch] : '?')).join('');
  const metrics = b => (s, sz) => (b ? bold : reg).widthOfTextAtSize(clean(s), sz);
  const L = layout(flatten(doc, ctx, fmt, opts), fmt, metrics, ctx);
  // letterhead PDF and logo
  let bg = null, logo = null;
  if (fmt.background && fmt.background.bytes) { try { const src = await P.PDFDocument.load(fmt.background.bytes, { ignoreEncryption: true }); const idx = Math.max(0, Math.min(src.getPageCount() - 1, (fmt.background.page || 1) - 1)); [bg] = await out.embedPdf(src, [idx]); } catch (e) { (ctx.warnings = ctx.warnings || []).push('The letterhead PDF could not be read: ' + (e.message || e)); } }
  const logoBytes = files && files.logo; if (logoBytes && fmt.letterhead.logo !== 'none') { try { logo = files.logoType === 'image/png' ? await out.embedPng(logoBytes) : await out.embedJpg(logoBytes); } catch (_e) { logo = null; } }
  const imgs = {}; for (const m of marksOf(doc)) { try { imgs[m.id] = /png/.test(m.img.slice(5, 16)) ? await out.embedPng(dataBytes(m.img)) : await out.embedJpg(dataBytes(m.img)); } catch (_e) { /* skipped */ } }
  L.pages.forEach((p, i) => {
    const page = out.addPage([L.W, L.H]);
    const bgMode = fmt.background && fmt.background.mode; if (bg && (bgMode === 'all' || (bgMode === 'first' && i === 0) || (bgMode === 'letters' && p.letterhead))) page.drawPage(bg, { x: 0, y: 0, width: L.W, height: L.H });
    if (p.lh) { let x = p.lh.x; const lh = p.lh; if (logo && lh.logo !== 'none') { const h = 40, w = Math.min(160, h * logo.width / logo.height); const lx = lh.align === 'right' ? lh.xr - w : lh.x; page.drawImage(logo, { x: lx, y: lh.y - h - 4, width: w, height: h }); if (lh.align !== 'right') x = lh.x + w + 14; }
      lh.lines.forEach((t, j) => { const f = j ? reg : bold, sz = j ? fmt.size - 1.5 : fmt.size + 3; const s = clean(t); const w = f.widthOfTextAtSize(s, sz); const tx = lh.align === 'right' && !logo ? lh.xr - w : (lh.align === 'right' ? lh.x : x); page.drawText(s, { x: tx, y: lh.y - sz - j * (fmt.size + 2) - (j ? 6 : 0), size: sz, font: f, color: hex(P, j ? '#475569' : fmt.accent) }); }); }
    p.items.forEach(it => {
      if (it.k === 'text') { const s = clean(it.t); if (s) page.drawText(s, { x: it.x, y: it.y - it.size * 0.8, size: it.size, font: it.bold ? bold : reg, color: hex(P, it.color) }); }
      else if (it.k === 'line') page.drawLine({ start: { x: it.x1, y: it.y }, end: { x: it.x2, y: it.y2 != null ? it.y2 : it.y }, thickness: it.w, color: hex(P, it.color) });
      else if (it.k === 'img') { if (imgs[it.src]) page.drawImage(imgs[it.src], { x: it.x, y: it.y, width: it.w, height: it.h }); }
      else if (it.k === 'rect') page.drawRectangle({ x: it.x, y: it.y, width: it.w, height: it.h, color: it.fill ? hex(P, it.fill) : undefined, borderColor: hex(P, it.stroke), borderWidth: 0.6 });
    });
  });
  const ranges = {}; L.pages.forEach((p, i) => { if (p.cover || p.letter) return; const k = p.section.number + '|' + p.section.title; if (!ranges[k]) ranges[k] = [i + 1, i + 1]; else ranges[k][1] = i + 1; }); // v31: where each section falls in the book
  return { bytes: await out.save(), pages: L.pages.length, ranges };
}

/* ------------------------------------------------------------------ Word (.docx) */
const xe = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const TW = in_ => Math.round(in_ * 1440);
// Put w:type and w:pgNumType where the WordprocessingML schema expects them inside w:sectPr.
function sectWith(sp, nextPage) {
  sp = sp.replace(/<w:type [^>]*\/>/g, '').replace(/<w:pgNumType[^>]*\/>/g, '').replace(/<w:pgNumType[^>]*>[\s\S]*?<\/w:pgNumType>/g, '');
  if (!/<\/w:sectPr>/.test(sp)) sp = sp.replace(/<w:sectPr([^>]*)\/>/, '<w:sectPr$1></w:sectPr>');
  const open = sp.match(/^<w:sectPr[^>]*>/)[0]; let inner = sp.slice(open.length, sp.lastIndexOf('</w:sectPr>'));
  const refs = inner.match(/^(\s*<w:(headerReference|footerReference|footnotePr|endnotePr)\b[^>]*?(\/>|>[\s\S]*?<\/w:\2>))*/)[0];
  inner = refs + (nextPage ? '<w:type w:val="nextPage"/>' : '') + inner.slice(refs.length);
  const at = inner.search(/<w:(cols|formProt|vAlign|noEndnote|titlePg|textDirection|bidi|rtlGutter|docGrid|printerSettings|sectPrChange)\b/);
  const pn = '<w:pgNumType w:start="1"/>';
  inner = at < 0 ? inner + pn : inner.slice(0, at) + pn + inner.slice(at);
  return open + inner + '</w:sectPr>';
}
function docxBody(blocks, fmt, styles, sectPr) {
  const ind = fmt.indent, font = styles.direct ? FONTS[fmt.font][2] : null, sz = Math.round(fmt.size * 2);
  const rpr = (o) => `<w:rPr>${font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>` : ''}${o.bold ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color.slice(1)}"/>` : ''}${styles.direct || o.size ? `<w:sz w:val="${Math.round((o.size || fmt.size) * 2)}"/>` : ''}</w:rPr>`;
  const run = (t, o) => `<w:r>${rpr(o || {})}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  const P = (inner, o) => `<w:p><w:pPr>${o.style && styles.ids[o.style] ? `<w:pStyle w:val="${styles.ids[o.style]}"/>` : ''}${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${Math.round((o.before || 0) * 20)}" w:after="${Math.round((o.after || 0) * 20)}"/>${o.ind || ''}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${inner}</w:p>`;
  const parts = [];
  const sect = () => { // section break that keeps the template section properties; page numbers restart
    parts.push(`<w:p><w:pPr>${sectWith(sectPr || '<w:sectPr></w:sectPr>', true)}</w:pPr></w:p>`);
  };
  for (const b of blocks) {
    if (b.t === 'mark') continue;
    if (b.t === 'break') { if (b.restart && sectPr) sect(); else parts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); continue; }
    if (b.t === 'letterhead' || b.t === 'rule') { if (b.t === 'rule') parts.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="${fmt.accent.slice(1)}"/></w:pBdr><w:spacing w:after="160"/></w:pPr></w:p>`); continue; }
    if (b.t === 'cover') { parts.push(P(run(b.title, { bold: true, size: fmt.size * 2.2, color: fmt.accent }), { before: 160, after: 12, style: 'Title' })); b.lines.forEach(l => parts.push(P(l ? run(l, { size: fmt.size + 2 }) : '', { after: 4 }))); continue; }
    if (b.t === 'h') { parts.push(P(run(b.text, { bold: b.bold, size: b.size, color: b.accent ? fmt.accent : null }), { before: b.before, after: b.after, align: b.align === 'center' ? 'center' : null, keep: b.keep, style: b.style })); continue; }
    if (b.t === 'toc') { parts.push(P(run(b.number) + '<w:r><w:tab/></w:r>' + run(b.title), { ind: `<w:tabs><w:tab w:val="left" w:pos="${TW(ind * 2.4)}"/></w:tabs>`, after: 0 })); continue; }
    if (b.t === 'p') {
      if (b.blank) { parts.push(P('', {})); continue; }
      const lvl = b.lvl; let left, hang;
      if (lvl === -2) { left = 0; hang = 0; } else if (lvl === -1) { left = TW(ind); hang = TW(ind); } else { left = TW(ind * (lvl + 2)); hang = b.label ? TW(ind) : 0; }
      const label = b.label && lvl !== -2 ? run(b.label, { bold: b.bold }) + '<w:r><w:tab/></w:r>' : '';
      parts.push(P(label + run(b.text, { bold: b.bold }), { before: b.before, after: b.after, keep: b.keep, style: b.style, ind: `<w:tabs><w:tab w:val="left" w:pos="${left}"/></w:tabs><w:ind w:left="${left}" w:hanging="${hang}"/>` }));
      continue;
    }
    if (b.t === 'marks') { // v30: one borderless table row of seals and signatures, each with its caption
      const EMU = 914400; let n = 0;
      const pic = m => { const [wi, hi] = markBox(m), cx = Math.round(wi * EMU), cy = Math.round(hi * EMU), id = 900 + (n++); return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${m.kind === 'seal' ? 'Seal' : 'Signature'} ${id}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="mark${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rMk${xe(String(m.id).replace(/[^\w]/g, ''))}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`; };
      const cell = m => `<w:tc><w:tcPr><w:tcW w:w="${TW(2.7)}" w:type="dxa"/><w:vAlign w:val="bottom"/></w:tcPr>${P(pic(m), { after: 3 })}${markCaption(m).map((c, i) => P(run(c, { bold: !i }), { after: 0 })).join('')}</w:tc>`;
      for (let i = 0; i < b.items.length; i += 3) { const row = b.items.slice(i, i + 3); parts.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${row.map(() => `<w:gridCol w:w="${TW(2.7)}"/>`).join('')}</w:tblGrid><w:tr>${row.map(cell).join('')}</w:tr></w:tbl>`, P('', { after: 6 })); }
      continue;
    }
    if (b.t === 'fields' || b.t === 'table') {
      const head = b.t === 'table' ? b.cols : null, rows = b.t === 'table' ? b.rows : b.rows;
      const border = b.t === 'table' ? '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="94A3B8"/><w:left w:val="single" w:sz="4" w:color="94A3B8"/><w:bottom w:val="single" w:sz="4" w:color="94A3B8"/><w:right w:val="single" w:sz="4" w:color="94A3B8"/><w:insideH w:val="single" w:sz="4" w:color="94A3B8"/><w:insideV w:val="single" w:sz="4" w:color="94A3B8"/></w:tblBorders>' : '';
      const cell = (t, o) => `<w:tc><w:tcPr>${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ''}</w:tcPr>${String(t || '').split('\n').map(line => P(line ? run(line, { bold: o.bold, size: o.size }) : '', { after: 0 })).join('')}</w:tc>`;
      const ncol = (head || rows[0] || ['']).length, tw = TW(pageSize(fmt)[0] - fmt.margins.l - fmt.margins.r), gw = b.t === 'fields' ? [Math.round(tw * 0.28), tw - Math.round(tw * 0.28)] : Array.from({ length: ncol }, () => Math.floor(tw / ncol));
      let x = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${border}<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${gw.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
      if (head) x += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map(h => cell(h, { bold: true, fill: 'EEF2F7' })).join('')}</w:tr>`;
      (rows.length ? rows : [head.map(() => '')]).forEach(r => { x += `<w:tr>${r.map((c, i) => cell(c, b.t === 'fields' && i === 0 ? { bold: true, size: fmt.size - 1.5 } : {})).join('')}</w:tr>`; });
      parts.push(x + '</w:tbl>', P('', { after: b.after || 6 })); continue;
    }
  }
  return parts.join('');
}
function fieldRun(instr, rpr) { rpr = rpr || ''; return `<w:r>${rpr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rpr}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r>${rpr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rpr}<w:t>1</w:t></w:r><w:r>${rpr}<w:fldChar w:fldCharType="end"/></w:r>`; }
function hfXml(tag, cells, fmt, R, o) { // three tab-separated parts: left, center, right. {page} becomes a PAGE field, {pages} NUMPAGES, {section_pages} SECTIONPAGES.
  o = o || {}; const W = TW(pageSize(fmt)[0] - fmt.margins.l - fmt.margins.r), font = FONTS[fmt.font][2];
  const rpr = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${o.bold ? '<w:b/>' : ''}<w:color w:val="${o.bold ? '000000' : '334155'}"/><w:sz w:val="${Math.round((o.bold ? fmt.size : fmt.size - 2) * 2)}"/></w:rPr>`;
  const runs = s => R(s).replace(/\[[^\]]*\]/g, '').split(/(\{page\}|\{page_total\}|\{pages\}|\{section_pages\}|\t)/).map(part => part === '{page}' || part === '{page_total}' ? fieldRun('PAGE', rpr) : part === '{pages}' ? fieldRun('NUMPAGES', rpr) : part === '{section_pages}' ? fieldRun('SECTIONPAGES', rpr) : part === '\t' ? `<w:r>${rpr}<w:tab/></w:r>` : part ? `<w:r>${rpr}<w:t xml:space="preserve">${xe(part)}</w:t></w:r>` : '').join('');
  const bdr = side => `<w:pBdr><w:${side} w:val="single" w:sz="6" w:space="${side === 'top' ? 4 : 1}" w:color="000000"/></w:pBdr>`;
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  if (o.block) { // the project block: one paragraph per line, a rule under the last one
    const lines = o.block.split('\n').filter(x => x.trim());
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} ${NS}>${lines.map((l, i) => `<w:p><w:pPr>${o.rule && i === lines.length - 1 ? bdr('bottom') : ''}<w:tabs><w:tab w:val="left" w:pos="${TW(1.6)}"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${runs(l)}</w:p>`).join('')}</w:${tag}>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} ${NS}><w:p><w:pPr>${o.rule ? bdr(tag === 'ftr' ? 'top' : 'bottom') : ''}<w:tabs><w:tab w:val="center" w:pos="${Math.round(W / 2)}"/><w:tab w:val="right" w:pos="${W}"/></w:tabs></w:pPr>${runs(cells[0] || '')}<w:r><w:tab/></w:r>${runs(cells[1] || '')}<w:r><w:tab/></w:r>${runs(cells[2] || '')}</w:p></w:${tag}>`;
}
async function docx(doc, ctx, fmt, files, opts) {
  const JSZip = await zipLib(); fmt = fixFormat(fmt); const blocks = flatten(doc, ctx, fmt, opts);
  const R = t => resolve(t, ctx), D = (ctx && ctx.data) || {};
  const tplBytes = files && files.wordTemplate;
  const fillXml = xml => xml.replace(/&lt;&lt;([a-z0-9_]+)&gt;&gt;/g, (m, k) => D[k] != null && String(D[k]).trim() ? xe(D[k]) : m);
  if (tplBytes) { // keep the client's or firm's own Word template: styles, headers, footers and page setup
    const zip = await JSZip.loadAsync(tplBytes); const docXml = await zip.file('word/document.xml')?.async('string'); if (!docXml) throw new Error('This Word file has no document body.');
    const stylesXml = (await zip.file('word/styles.xml')?.async('string')) || '';
    const findStyle = names => { for (const n of names) { const re = new RegExp(`<w:style [^>]*w:styleId="([^"]+)"[^>]*>(?:(?!</w:style>).)*?<w:name w:val="${n}"`, 'is'); const m = stylesXml.match(re); if (m) return m[1]; } return null; };
    const ids = { Title: findStyle(['Title']), Heading1: findStyle(['heading 1', 'Heading 1']), Heading2: findStyle(['heading 2', 'Heading 2']) };
    const sm = docXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>\s*<\/w:body>/); const sectPr = sm ? sm[0].replace(/<\/w:body>$/, '').trim() : '<w:sectPr/>';
    const bodyStart = docXml.indexOf('<w:body>'), bodyEnd = docXml.lastIndexOf('</w:body>'); if (bodyStart < 0 || bodyEnd < 0) throw new Error('This Word file could not be read.');
    const body = docxBody(blocks, fmt, { ids, direct: false }, sectPr);
    { const mk = marksOf(doc); if (mk.length) { // v30: seal and signature images in the client's or firm's template
      const rp = 'word/_rels/document.xml.rels'; let rx = (await zip.file(rp)?.async('string')) || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      mk.forEach(m => { const k = String(m.id).replace(/[^\w]/g, ''), ext = /png/.test(m.img.slice(5, 16)) ? 'png' : 'jpeg'; zip.file(`word/media/mark_${k}.${ext}`, dataBytes(m.img)); rx = rx.replace('</Relationships>', `<Relationship Id="rMk${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/mark_${k}.${ext}"/></Relationships>`); });
      zip.file(rp, rx); let ct = (await zip.file('[Content_Types].xml')?.async('string')) || '';
      ['png', 'jpeg'].forEach(e => { if (ct && !new RegExp(`Extension="${e}"`, 'i').test(ct)) ct = ct.replace(/<Types([^>]*)>/, `<Types$1><Default Extension="${e}" ContentType="image/${e}"/>`); }); if (ct) zip.file('[Content_Types].xml', ct);
    } }
    zip.file('word/document.xml', docXml.slice(0, bodyStart + 8) + body + (blocks.some(b => b.restart) ? sectWith(sectPr, false) : sectPr) + docXml.slice(bodyEnd));
    if (marksOf(doc).length) { let dx = await zip.file('word/document.xml').async('string'); const NSX = { wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', a: 'http://schemas.openxmlformats.org/drawingml/2006/main', pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture', r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships' };
      dx = dx.replace(/<w:document\b([^>]*)>/, (m0, at) => '<w:document' + at + Object.entries(NSX).filter(([k]) => !new RegExp('xmlns:' + k + '=').test(at)).map(([k, v]) => ` xmlns:${k}="${v}"`).join('') + '>'); zip.file('word/document.xml', dx); } // v30: images need these namespaces
    for (const name of Object.keys(zip.files)) if (/^word\/(header|footer)\d*\.xml$/.test(name)) zip.file(name, fillXml(await zip.file(name).async('string')));
    return zip.generateAsync({ type: 'uint8array' });
  }
  const zip = new JSZip(); const [pw, ph] = pageSize(fmt), M = fmt.margins, font = FONTS[fmt.font][2];
  const isLetter = (doc.kind || 'spec') !== 'spec';
  const hdr = isLetter ? ['', '', ''] : [fmt.header.left, '', fmt.header.right];
  const ftr = isLetter ? [fmt.letter_footer.left, fmt.letter_footer.center, fmt.letter_footer.right] : [fmt.footer.left, fmt.footer.center, fmt.footer.right];
  // spec sections each get their own footer (section number and title), so each Word section has its own footer part
  const secs = []; let cur = null; blocks.forEach(b => { if (b.t === 'break' || b.t === 'mark') { if (b.restart || !cur) { cur = { section: b.section }; secs.push(cur); } } }); if (!secs.length) secs.push({ section: { number: doc.doc_number || '', title: R(doc.title || '') } });
  const rels = ['<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>', '<Relationship Id="rSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'];
  const ctypes = [];
  zip.file('word/header1.xml', hfXml('hdr', hdr, fmt, R, isLetter ? {} : { block: fmt.header.block, rule: fmt.header.rule, bold: fmt.header.bold })); rels.push('<Relationship Id="rH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'); ctypes.push('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>');
  secs.forEach((s, i) => { const f = ftr.map(c => fill(c, { section_number: s.section.number, section_title: s.section.title })); zip.file(`word/footer${i + 1}.xml`, hfXml('ftr', f, fmt, R, isLetter ? {} : { rule: fmt.footer.rule, bold: fmt.footer.bold })); rels.push(`<Relationship Id="rF${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer${i + 1}.xml"/>`); ctypes.push(`<Override PartName="/word/footer${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`); });
  const sectFor = (i, next) => `<w:sectPr><w:headerReference w:type="default" r:id="rH1"/><w:footerReference w:type="default" r:id="rF${i + 1}"/>${next ? '<w:type w:val="nextPage"/>' : ''}<w:pgSz w:w="${TW(pw)}" w:h="${TW(ph)}"${fmt.orientation === 'landscape' ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${TW(M.t + 0.35)}" w:right="${TW(M.r)}" w:bottom="${TW(M.b + 0.35)}" w:left="${TW(M.l)}" w:header="${TW(M.t)}" w:footer="${TW(M.b)}" w:gutter="0"/><w:pgNumType w:start="1"/></w:sectPr>`;
  // build body: split per section so each section break carries its own footer
  let body = ''; const chunks = []; let curChunk = [];
  blocks.forEach(b => { if ((b.t === 'break' && b.restart) && curChunk.length) { chunks.push(curChunk); curChunk = []; } if (!(b.t === 'break' && b.restart)) curChunk.push(b); });
  if (curChunk.length) chunks.push(curChunk);
  const styles = { ids: { Title: 'Title', Heading1: 'Heading1', Heading2: 'Heading2' }, direct: true };
  // letterhead as the first lines of a letter
  const lhLines = isLetter && fmt.letterhead.show ? R(fmt.letterhead.lines || '').split('\n').map(s => s.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean) : [];
  let logoRun = '';
  if (isLetter && files && files.logo && fmt.letterhead.logo !== 'none') { const ext = files.logoType === 'image/png' ? 'png' : 'jpeg'; zip.file('word/media/logo.' + ext, files.logo); rels.push(`<Relationship Id="rLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${ext}"/>`); const ratio = (files.logoW || 4) / (files.logoH || 1); const h = 457200, w = Math.round(Math.min(5 * 457200, h * ratio)); logoRun = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="1" name="Logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`; }
  marksOf(doc).forEach(m => { const k = String(m.id).replace(/[^\w]/g, ''), ext = /png/.test(m.img.slice(5, 16)) ? 'png' : 'jpeg'; zip.file(`word/media/mark_${k}.${ext}`, dataBytes(m.img)); rels.push(`<Relationship Id="rMk${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/mark_${k}.${ext}"/>`); }); // v30
  if (logoRun) body += `<w:p><w:pPr><w:jc w:val="${fmt.letterhead.align === 'right' ? 'right' : 'left'}"/></w:pPr>${logoRun}</w:p>`;
  lhLines.forEach((t, j) => { body += `<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="${fmt.letterhead.align === 'right' ? 'right' : 'left'}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>${j ? '' : '<w:b/>'}<w:color w:val="${j ? '475569' : fmt.accent.slice(1)}"/><w:sz w:val="${Math.round((j ? fmt.size - 1.5 : fmt.size + 3) * 2)}"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r></w:p>`; });
  if (lhLines.length) body += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="CBD5E1"/></w:pBdr><w:spacing w:after="240"/></w:pPr></w:p>';
  chunks.forEach((ch, i) => { body += docxBody(ch, fmt, styles, ''); if (i < chunks.length - 1) body += `<w:p><w:pPr>${sectFor(i, i > 0)}</w:pPr></w:p>`; });
  const lastSect = sectFor(Math.max(0, chunks.length - 1), chunks.length > 1);
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${lastSect}</w:body></w:document>`.replace(/<w:pgNumType w:start="1"\/>/g, /\{page_total\}/.test([fmt.footer.left, fmt.footer.center, fmt.footer.right, fmt.header.left, fmt.header.right].join(' ')) ? '' : '$&'));
  const sz = Math.round(fmt.size * 2), acc = fmt.accent.slice(1);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="${Math.round(240 * fmt.line)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:color w:val="${acc}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style></w:styles>`);
  zip.file('word/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/></w:settings>');
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(R(doc.title || 'Document'))}</dc:title><dc:creator>${xe(D.firm_name || 'DrawUp')}</dc:creator><cp:keywords>DrawUp Specs</cp:keywords></cp:coreProperties>`);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${ctypes.join('')}</Types>`);
  return zip.generateAsync({ type: 'uint8array' });
}

/* ------------------------------------------------------------------ import a section from Word or PDF */
async function readDocxText(bytes) { // -> [{text, lvl}] using Word list levels where the numbering is automatic
  const JSZip = await zipLib(); const zip = await JSZip.loadAsync(bytes); const xml = await zip.file('word/document.xml')?.async('string'); if (!xml) throw new Error('This Word file has no document body.');
  const out = []; (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).forEach(p => { const t = (p.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:tab\/>/g) || []).map(x => x === '<w:tab/>' ? '\t' : x.replace(/<[^>]+>/g, '')).join('').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); const il = p.match(/<w:ilvl w:val="(\d+)"/); const num = /<w:numPr>/.test(p); if (t.trim()) out.push({ text: t.trim(), lvl: num ? +(il ? il[1] : 0) : null }); });
  return out;
}
async function readPdfText(bytes) { const L = await pdfjs(); const d = await L.getDocument({ data: bytes.slice() }).promise; const out = []; for (let i = 1; i <= Math.min(d.numPages, 80); i++) { const pg = await d.getPage(i); const tc = await pg.getTextContent(); let line = '', lastY = null; tc.items.forEach(it => { const y = Math.round(it.transform[5]); if (lastY != null && Math.abs(y - lastY) > 2) { if (line.trim()) out.push({ text: line.trim(), lvl: null, x: 0 }); line = ''; } line += it.str; lastY = y; }); if (line.trim()) out.push({ text: line.trim(), lvl: null }); } return out; }
// Turns imported lines into {number,title,parts}. Recognizes SECTION nn nn nn, PART n, 1.1 TITLE, A. / 1. / a. paragraphs.
function parseSpecText(lines) {
  const sec = { number: '', title: '', parts: { 1: [], 2: [], 3: [] } }; let part = 1, artc = null, lastLvl = 0; const skip = /^(end of section|page \d+|\d+\s*$)/i;
  const addPara = (t, lvl) => { if (!artc) { artc = { id: rid(), title: 'GENERAL', paras: [] }; sec.parts[part].push(artc); } artc.paras.push({ id: rid(), t, lvl, base: t }); lastLvl = lvl; };
  for (const { text, lvl } of lines) {
    const s = text.replace(/\s+/g, ' ').trim(); if (!s || skip.test(s)) continue; let m;
    if (!sec.number && (m = s.match(/^SECTION\s+(\d{2}\s?\d{2}\s?\d{2}(?:\.\d{2})?)\s*[-–—:]?\s*(.*)$/i))) { sec.number = m[1].replace(/^(\d{2})\s?(\d{2})\s?(\d{2})/, '$1 $2 $3'); if (m[2]) sec.title = m[2]; continue; }
    if (sec.number && !sec.title && /^[A-Z0-9 ,'&()\/-]{4,}$/.test(s) && !/^PART\b/.test(s)) { sec.title = s; continue; }
    if ((m = s.match(/^PART\s+([123])\b/i))) { part = +m[1]; artc = null; continue; }
    if ((m = s.match(/^([123])\.(\d{1,2})\s+(.+)$/))) { part = +m[1]; artc = { id: rid(), title: m[3].replace(/\s*[.:]$/, ''), paras: [] }; sec.parts[part].push(artc); continue; }
    if ((m = s.match(/^([A-Z])\.\s+(.+)$/))) { addPara(m[2], 0); continue; }
    if ((m = s.match(/^(\d{1,2})\.\s+(.+)$/))) { addPara(m[2], 1); continue; }
    if ((m = s.match(/^([a-z])\.\s+(.+)$/))) { addPara(m[2], 2); continue; }
    if ((m = s.match(/^(\d{1,2})\)\s+(.+)$/))) { addPara(m[2], 3); continue; }
    if (lvl != null) { addPara(s, Math.min(3, lvl)); continue; }
    if (artc && artc.paras.length) { const p = artc.paras[artc.paras.length - 1]; p.t += ' ' + s; p.base = p.t; } else addPara(s, lastLvl);
  }
  return sec;
}
function rid() { return (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 13); }

window.DrawUpSpecsExport = { marksOf, markBox, markCaption, DRAWUP_FORMAT, PAGES, pageSize, FONTS, fixFormat, tokens, untokens, resolve, openItems, fill, paraLabels, flatten, layout, pdf, docx, readDocxText, readPdfText, parseSpecText, rid, pdfLib, pdfjs, zipLib };
})();
