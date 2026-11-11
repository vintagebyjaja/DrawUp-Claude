/* DrawUp Season 1 · Specification imports that keep every word.
 *
 * window.DrawUpSpecsImport = { open(S), readDocx, readPdf, toSections, coverage, formatCheck, merge, docxLayout, SOURCES }
 *
 * Four ways in, one importer:
 *   client      the client's front-end and technical specs, in their format
 *   firm        the firm's standard (master) sections
 *   drawup      sections already in the DrawUp standard layout (for example the Division 01 set)
 *   consultant  a consultant's sections, merged into this manual and checked for a clean transition
 * Rules (from the member's brief): nothing uploaded is removed. Reformatting only realigns. Each import is checked
 * word for word against the file it came from, and the result says exactly what was realigned:
 *   - automatic and typed numbering (PART 1, 1.01, A., 1., a.) becomes the manual's own numbering;
 *   - "END OF SECTION" lines are written by the layout, so they are not kept as text;
 *   - PART 4 and later are kept as articles at the end of Part 3, with their own titles;
 *   - text with no number (editor's notes, schedules, table rows, cover and contents pages) is kept, unnumbered,
 *     where it was.
 * A section number that is already in the manual is never overwritten: the import is added next to it and flagged.
 * Everything lands as editable Draft sections.
 */
(function () {
  'use strict';
  if (window.DrawUpSpecsImport) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const X = () => window.DrawUpSpecsExport, Sp = () => window.DrawUpSpecs;
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const SOURCES = {
    client: { label: 'Client specs', text: 'The client’s front-end and technical sections, in their format. Every word is kept; you can also keep their page layout as a client format.' },
    firm: { label: 'Firm standard', text: 'Your firm’s standard (master) sections. They come in as editable Draft sections.' },
    drawup: { label: 'DrawUp standard', text: 'Sections already in the DrawUp standard layout, such as a Division 01 set exported from DrawUp.' },
    consultant: { label: 'Consultant specs', text: 'A consultant’s sections, merged into this manual. DrawUp checks that every word came across and that the sections fit the manual’s format.' },
  };
  const SECTION_RE = /^SECTION\s+(\d{2})\s?(\d{2})\s?(\d{2})(\.\d{1,2})?\b\s*[-–—:]?\s*(.*)$/; // capitals only: "Section 01 33 00" in a sentence is a reference
const LOOSE_SECTION_RE = /^SECTION\s+([\d][\d\s.]{3,14})$/;    // a mistyped number (for example SECTION 01 00010)
  const PART_RE = /^PART\s+(\d+)\s*[-–—:.]?\s*(.*)$/i;
  const ART_RE = /^(\d)\.(\d{1,2})\s+(.+)$/;
  const END_RE = /^END\s+OF\s+SECTION\b/i;
  const norm = n => n.replace(/^(\d{2})\s?(\d{2})\s?(\d{2})/, '$1 $2 $3');

  /* ------------------------------------------------------------------ Word */
  const kids = (el, name) => el ? Array.from(el.childNodes).filter(n => n.nodeType === 1 && n.localName === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const val = el => el ? el.getAttributeNS(W, 'val') || el.getAttribute('w:val') : null;
  function textOf(p) {
    let s = '';
    p.querySelectorAll('*').forEach(n => {
      if (n.namespaceURI !== W) return;
      if (n.localName === 't') s += n.textContent; else if (n.localName === 'tab' && n.parentNode.localName === 'r') s += '\t';
      else if ((n.localName === 'br' || n.localName === 'cr') && n.parentNode.localName === 'r') s += ' ';
      else if (n.localName === 'noBreakHyphen') s += '-';
    });
    return s.replace(/ /g, ' ');
  }
  /** Word list level -> what it means in a spec. */
  function kindOfLevel(lv) {
    if (!lv) return null;
    const fmt = lv.fmt || 'decimal', t = lv.text || '';
    if (/PART/i.test(t)) return { k: 'part' };
    if (/SCHEDULE|PRODUCT DATA|ATTACHMENT|APPENDIX/i.test(t)) return { k: 'plain' };
    if (fmt === 'bullet' || fmt === 'none') return { k: 'plain' };
    if ((t.match(/%\d/g) || []).length >= 2 && /%\d\.0?%\d/.test(t)) return { k: 'article' };
    if (fmt === 'decimalZero' && /%\d\.%\d/.test(t)) return { k: 'article' };
    if (fmt === 'upperLetter') return { k: 'p', lvl: 0 };
    if (fmt === 'decimal' && /\)$/.test(t)) return { k: 'p', lvl: 3 };
    if (fmt === 'decimal') return { k: 'p', lvl: 1 };
    if (fmt === 'lowerLetter' && /\)$/.test(t)) return { k: 'p', lvl: 3 };
    if (fmt === 'lowerLetter') return { k: 'p', lvl: 2 };
    if (/roman/i.test(fmt)) return { k: 'p', lvl: 3 };
    return { k: 'p', lvl: 1 };
  }
  /** .docx -> blocks [{ t, k: section|title|part|article|p|plain|end, lvl, n }] in document order, every paragraph and
   *  table row included. Numbering comes from Word's own list definitions (paragraph or style), or typed labels. */
  async function readDocx(bytes) {
    const JSZip = await X().zipLib(); const z = await JSZip.loadAsync(bytes);
    const read = async n => { const f = z.file(n); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
    const doc = await read('word/document.xml'); if (!doc) throw new Error('This Word file has no document body.');
    const sty = await read('word/styles.xml'), num = await read('word/numbering.xml');
    const styles = {};
    if (sty) Array.from(sty.getElementsByTagNameNS(W, 'style')).forEach(s => {
      const id = s.getAttributeNS(W, 'styleId') || s.getAttribute('w:styleId'); const ppr = kid(s, 'pPr'), np = ppr && kid(ppr, 'numPr');
      styles[id] = { based: val(kid(s, 'basedOn')), numId: np ? val(kid(np, 'numId')) : null, ilvl: np && kid(np, 'ilvl') ? +val(kid(np, 'ilvl')) : null };
    });
    const abs = {}, nums = {}, linkOf = {};
    if (num) {
      Array.from(num.getElementsByTagNameNS(W, 'abstractNum')).forEach(a => {
        const id = a.getAttributeNS(W, 'abstractNumId') || a.getAttribute('w:abstractNumId'); const lv = {};
        kids(a, 'lvl').forEach(l => { const i = +(l.getAttributeNS(W, 'ilvl') || l.getAttribute('w:ilvl')); lv[i] = { fmt: val(kid(l, 'numFmt')), text: val(kid(l, 'lvlText')) || '' }; });
        const sl = val(kid(a, 'styleLink')), nl = val(kid(a, 'numStyleLink'));
        abs[id] = { lv, nl }; if (sl) linkOf[sl] = id;
      });
      Array.from(num.getElementsByTagNameNS(W, 'num')).forEach(n => { nums[n.getAttributeNS(W, 'numId') || n.getAttribute('w:numId')] = val(kid(n, 'abstractNumId')); });
    }
    const levelOf = (numId, ilvl) => { let a = abs[nums[numId]]; if (a && a.nl && linkOf[a.nl]) a = abs[linkOf[a.nl]]; return a ? a.lv[ilvl || 0] : null; };
    const styleNum = id => { let s = styles[id], guard = 0; while (s && guard++ < 12) { if (s.numId != null) return s; s = styles[s.based]; } return null; };
    const out = [];
    const para = p => {
      const raw = textOf(p); const t = raw.replace(/\s+/g, ' ').trim(); if (!t) return;
      const ppr = kid(p, 'pPr'); const np = ppr && kid(ppr, 'numPr'); const ps = ppr && val(kid(ppr, 'pStyle'));
      let numId = np && kid(np, 'numId') ? val(kid(np, 'numId')) : null, ilvl = np && kid(np, 'ilvl') ? +val(kid(np, 'ilvl')) : null;
      if (numId == null && ps) { const s = styleNum(ps); if (s) { numId = s.numId; if (ilvl == null) ilvl = s.ilvl; } }
      const lk = numId && numId !== '0' ? kindOfLevel(levelOf(numId, ilvl || 0)) : null;
      out.push(classify(t, lk));
    };
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    const visit = el => Array.from(el.childNodes).forEach(n => {
      if (n.nodeType !== 1 || n.namespaceURI !== W) return;
      if (n.localName === 'p') para(n);
      else if (n.localName === 'tbl') kids(n, 'tr').forEach(tr => { const cells = kids(tr, 'tc').map(tc => Array.from(tc.getElementsByTagNameNS(W, 'p')).map(textOf).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ')); const t = cells.filter(Boolean).join(' | '); if (t) out.push({ t, k: 'plain', table: true }); });
      else if (n.localName === 'sdt' || n.localName === 'sdtContent' || n.localName === 'customXml' || n.localName === 'smartTag') visit(n);
    });
    visit(body);
    return out;
  }
  /** One line of text (with what Word's numbering says it is, when there is numbering) -> a block. */
  function classify(t, lk) {
    let m;
    if (END_RE.test(t)) return { t, k: 'end' };
    if ((m = t.match(SECTION_RE))) return { t, k: 'section', n: norm(m[1] + ' ' + m[2] + ' ' + m[3]) + (m[4] || ''), title: m[5] || '' };
    if ((m = t.match(LOOSE_SECTION_RE))) return { t, k: 'section', n: null, typed_n: m[1].trim(), title: '' };
    if (lk && lk.k === 'part') return { t, k: 'part', n: null, title: t };
    if (lk && lk.k === 'article') return { t, k: 'article', title: t };
    if (lk && lk.k === 'p') return { t, k: 'p', lvl: lk.lvl };
    if (lk && lk.k === 'plain') return { t, k: 'plain' };
    if ((m = t.match(PART_RE)) && +m[1] >= 1 && +m[1] <= 9) return { t, k: 'part', n: +m[1], title: m[2] || '', typed: true };
    if ((m = t.match(ART_RE))) return { t, k: 'article', n: +m[1], title: m[3], typed: true };
    if ((m = t.match(/^([A-Z])\.\s+(.+)$/))) return { t: m[2], k: 'p', lvl: 0, typed: m[1] + '.' };
    if ((m = t.match(/^(\d{1,2})\.\s+(.+)$/))) return { t: m[2], k: 'p', lvl: 1, typed: m[1] + '.' };
    if ((m = t.match(/^([a-z])\.\s+(.+)$/))) return { t: m[2], k: 'p', lvl: 2, typed: m[1] + '.' };
    if ((m = t.match(/^(\d{1,2})\)\s+(.+)$/))) return { t: m[2], k: 'p', lvl: 3, typed: m[1] + ')' };
    return { t, k: 'plain' };
  }

  /* ------------------------------------------------------------------ PDF (text layer) */
  async function readPdf(bytes) {
    const L = await X().pdfjs(); const d = await L.getDocument({ data: bytes.slice() }).promise; const pages = [];
    for (let i = 1; i <= Math.min(d.numPages, 400); i++) {
      const pg = await d.getPage(i); const tc = await pg.getTextContent(); const lines = []; let line = '', lastY = null;
      tc.items.forEach(it => { const y = Math.round(it.transform[5]); if (lastY != null && Math.abs(y - lastY) > 2) { if (line.trim()) lines.push(line.replace(/\s+/g, ' ').trim()); line = ''; } line += it.str + (it.hasEOL ? ' ' : ''); lastY = y; });
      if (line.trim()) lines.push(line.replace(/\s+/g, ' ').trim()); pages.push(lines);
    }
    // page headers and footers: lines that repeat (numbers ignored) on at least half the pages are layout, not text
    const key = s => s.replace(/\d+/g, '#').toLowerCase(); const seen = {};
    pages.forEach(ls => new Set(ls.slice(0, 5).concat(ls.slice(-4)).map(key)).forEach(k => { seen[k] = (seen[k] || 0) + 1; }));
    const rep = new Set(Object.keys(seen).filter(k => pages.length >= 2 && seen[k] >= Math.max(2, pages.length / 2)));
    const out = []; let layout = 0;
    pages.forEach(ls => ls.forEach((s, i) => { const edge = i < 5 || i >= ls.length - 4; if ((edge && rep.has(key(s))) || /^page \d+( of \d+)?$/i.test(s)) { layout++; return; } out.push(classify(s, null)); }));
    out.layoutLines = layout;
    return out;
  }

  /* ------------------------------------------------------------------ blocks -> sections */
  function fromName(name) {
    const b = String(name || '').replace(/\.\w+$/, '').replace(/_/g, ' ');
    const m = b.match(/^(\d{2})\s?(\d{2})\s?(\d{2})(\.\d{1,2})?\s*[-–—]?\s*(.*)$/) || b.match(/^(\d{2})\s?(\d{2})(\d{2})(\.\d{1,2})?\s*[-–—]?\s*(.*)$/);
    return m ? { number: norm(m[1] + ' ' + m[2] + ' ' + m[3]) + (m[4] || ''), title: (m[5] || '').trim() } : { number: '', title: b.trim() };
  }
  function toSections(blocks, o) {
    o = o || {}; const rid = () => X().rid(); const notes = [];
    const secs = []; let cur = null, part = 1, art = null, lastLvl = 0, wantTitle = false, seenPart = 0;
    const newSec = (number, title) => { cur = { id: rid(), number, title, state: 'draft', assigned: null, parts: { 1: [], 2: [], 3: [] }, part_titles: {}, imported: { file: o.file || '', source: o.source || '', at: new Date().toISOString() } }; secs.push(cur); part = 1; art = null; lastLvl = 0; seenPart = 0; };
    const ensureSec = () => { if (!cur) { const f = fromName(o.file); newSec(f.number || '00 00 00', f.title || (blocks.some(b => b.k === 'section') ? 'Front matter (imported)' : 'Imported section')); cur.auto = true; } };
    const ensureArt = () => { if (!art) { art = { id: rid(), title: '', base_title: '', untitled: true, paras: [] }; cur.parts[part].push(art); } };
    const add = (t, lvl, plain, typed) => { ensureSec(); ensureArt(); art.paras.push({ id: rid(), t, base: t, lvl: Math.max(0, Math.min(3, lvl)), ...(plain ? { plain: true } : {}) }); lastLvl = lvl; void typed; };
    // a few notes before the SECTION line (editor's notes, copyright lines) stay with that section; a long run
    // (a cover page and contents) is its own front-matter section
    const firstSec = blocks.findIndex(b => b.k === 'section'); let pre = [];
    if (firstSec > 0 && firstSec <= 15 && blocks.slice(0, firstSec).every(b => b.k === 'plain' || b.k === 'p')) { pre = blocks.slice(0, firstSec); blocks = blocks.slice(firstSec); }
    for (const b of blocks) {
      if (b.k === 'section') {
        let n = b.n; if (!n) { const f = fromName(o.file); n = f.number || '00 00 00'; notes.push({ k: 'number', t: `SECTION ${b.typed_n} is not a MasterFormat number; it was read as ${n} from the file name` }); }
        newSec(n, b.title || ''); if (!b.n) cur.typed_number = b.typed_n; wantTitle = !b.title;
        if (pre.length) { art = { id: rid(), title: '', base_title: '', untitled: true, lead: true, paras: pre.map(x => ({ id: rid(), t: x.k === 'p' && x.typed ? x.typed + ' ' + x.t : x.t, base: '', lvl: 0, plain: true })) }; art.paras.forEach(q => { q.base = q.t; }); cur.parts[1].push(art); art = null; pre = []; }
        continue; }
      if (wantTitle && cur && (b.k === 'plain' || b.k === 'p')) { cur.title = b.k === 'p' && b.typed ? b.typed + ' ' + b.t : b.t; wantTitle = false; continue; }
      wantTitle = false;
      if (b.k === 'end') { notes.push({ k: 'end', t: b.t }); continue; }
      ensureSec();
      if (b.k === 'part') {
        let title = (b.title || '').trim(), n = b.n; const tm = title.match(PART_RE); if (tm) { n = n || +tm[1]; title = (tm[2] || '').trim(); }
        if (!n) n = seenPart + 1; seenPart = n;
        if (n >= 1 && n <= 3) { part = n; art = null; if (title) cur.part_titles[n] = title; continue; }
        part = 3; art = { id: rid(), title: `PART ${n}${title ? ' - ' + title : ''}`, base_title: '', paras: [], realigned: 'part' }; cur.parts[3].push(art);
        notes.push({ k: 'part', t: `${cur.number} PART ${n} kept as the last article of Part 3` }); continue;
      }
      if (b.k === 'article') { if (b.typed && b.n >= 1 && b.n <= 3 && b.n !== part) { part = b.n; } art = { id: rid(), title: b.title, base_title: b.title, paras: [] }; cur.parts[part].push(art); lastLvl = 0; continue; }
      if (b.k === 'p') { add(b.t, b.lvl, false, b.typed); continue; }
      add(b.t, art && art.paras.length ? lastLvl : 0, true);
    }
    secs.forEach(s => { [1, 2, 3].forEach(n => s.parts[n].forEach(a => { a.base_title = a.title; }));
      // cover pages, contents and other text with no PART or article lines: kept as it is, with no PART or END lines added
      if (!Object.keys(s.part_titles).length && ![1, 2, 3].some(n => s.parts[n].some(a => !a.untitled))) s.front = true; delete s.auto; });
    return { sections: secs, notes };
  }

  /* ------------------------------------------------------------------ the no-loss check */
  const words = s => String(s || '').toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').split(/\s+/).map(w => w.replace(/^[^\w<{[]+|[^\w>}\]]+$/g, '')).filter(Boolean);
  function sectionWords(s) {
    const lead = (s.parts[1] || [])[0] && s.parts[1][0].lead ? s.parts[1][0] : null; // notes that sat above the SECTION line
    const out = [...(lead ? lead.paras.flatMap(p => words(p.t)) : []), 'section', ...words(s.number.replace(/ /g, '')), ...words(s.title)];
    [1, 2, 3].forEach(n => { if (s.part_titles && s.part_titles[n]) out.push(...words(s.part_titles[n])); (s.parts[n] || []).forEach(a => { if (a === lead) return; out.push(...words(a.title)); (a.paras || []).forEach(p => out.push(...words(p.t))); }); });
    return out;
  }
  /** In-order match of src words in dst. A far jump only counts when the next words match too, so one common word
   *  cannot skip the matcher past a stretch of text. */
  function align(src, dst) {
    let j = 0, kept = 0; const missing = []; let run = [];
    for (let i = 0; i < src.length; i++) {
      let k = -1;
      for (let x = j; x < Math.min(dst.length, j + 600); x++) if (dst[x] === src[i] && (x - j < 3 || i + 2 >= src.length || (dst[x + 1] === src[i + 1] && dst[x + 2] === src[i + 2]))) { k = x; break; }
      if (k >= 0) { kept++; j = k + 1; if (run.length) { missing.push(run.join(' ')); run = []; } } else run.push(src[i]);
    }
    if (run.length) missing.push(run.join(' '));
    return { kept, missing };
  }
  /** Every word of the source, in order, must be in the imported sections. Numbering labels and END OF SECTION lines
   *  are layout. Returns { total, kept, missing: [snippets], layout: n }. */
  function coverage(blocks, sections) {
    const src = []; let layout = 0;
    blocks.forEach(b => {
      if (b.k === 'end') { layout += words(b.t).length; return; }
      let t = b.k === 'section' ? (b.n ? 'section ' + b.n.replace(/ /g, '') + ' ' + (b.title || '') : 'section') : b.k === 'part' ? b.title.replace(PART_RE, '$2') : b.k === 'article' && b.typed ? b.title : b.t;
      if (b.k === 'section' && !b.n) layout += words(b.typed_n).length; // replaced by the file name's number, and reported
      if (b.k === 'part') layout += 2;
      src.push(...words(t));
    });
    const dst = sections.flatMap(sectionWords); const r = align(src, dst);
    return { total: src.length, kept: r.kept, missing: r.missing.slice(0, 40), layout };
  }

  /* ------------------------------------------------------------------ format check after a merge */
  function formatCheck(sections, doc) {
    const issues = [], info = []; const have = new Map();
    (doc.sections || []).forEach(s => { if (s.state !== 'excluded' && !sections.includes(s)) have.set(String(s.number).trim(), s); });
    sections.forEach(s => {
      if (!/^\d{2} \d{2} \d{2}(\.\d{1,2})?$/.test(s.number)) issues.push({ s: s.id, t: `${s.number || '(no number)'} ${s.title}: the section number is not in MasterFormat form (NN NN NN).` });
      if (have.has(s.number)) issues.push({ s: s.id, t: `${s.number} ${s.title}: the manual already has ${s.number}. Both are kept; compare them and exclude one.` });
      if (!s.title || /imported section/i.test(s.title)) issues.push({ s: s.id, t: `${s.number}: give the section a title.` });
      let plain = 0, typed = 0, jump = 0;
      [1, 2, 3].forEach(n => (s.parts[n] || []).forEach(a => { let prev = -1; (a.paras || []).forEach(p => { if (p.plain) { plain++; return; } if (/^([A-Z]|\d{1,2}|[a-z])[.)]\s/.test(p.t) || /^\d\.\d{2}\s/.test(p.t)) typed++; if (p.lvl > prev + 1 && prev >= -1 && p.lvl > 0 && prev < p.lvl - 1) jump++; prev = p.lvl; }); }));
      if (typed) issues.push({ s: s.id, t: `${s.number}: ${typed} paragraph${typed === 1 ? ' starts' : 's start'} with a typed number, so it would be numbered twice.`, fix: 'typed' });
      if (jump) issues.push({ s: s.id, t: `${s.number}: ${jump} paragraph${jump === 1 ? ' skips' : 's skip'} a level (for example 1. straight under an article). Check the indents.` });
      if (plain) info.push(`${s.number}: ${plain} unnumbered paragraph${plain === 1 ? '' : 's'} (notes, schedules or table rows) kept as they were.`);
      if (s.typed_number) info.push(`${s.number}: the file says SECTION ${s.typed_number}, which is not a MasterFormat number. It was read as ${s.number} from the file name; check it.`);
      if ([1, 2, 3].some(n => (s.parts[n] || []).some(a => a.realigned === 'part'))) info.push(`${s.number}: PART 4 or later kept as the last article of Part 3.`);
    });
    return { clean: !issues.length, issues, info };
  }
  /** Strips a typed number at the start of a paragraph (the manual numbers it). The words are untouched. */
  function stripTyped(sections) { let n = 0; sections.forEach(s => [1, 2, 3].forEach(k => (s.parts[k] || []).forEach(a => (a.paras || []).forEach(p => { if (p.plain) return; const m = p.t.match(/^(?:[A-Z]|\d{1,2}|[a-z])[.)]\s+|^\d\.\d{2}\s+/); if (m) { p.t = p.t.slice(m[0].length); p.base = p.t; n++; } })))); return n; }

  /** Adds imported sections to the manual. Never replaces a section: a number already there is added beside it. */
  function merge(doc, sections, source) {
    const added = [], beside = [];
    sections.forEach(s => {
      const twin = (doc.sections || []).find(x => x.state !== 'excluded' && String(x.number).trim() === s.number);
      if (twin) { s.title = `${s.title} (${SOURCES[source] ? SOURCES[source].label.toLowerCase() : 'imported'})`; s.dup_of = twin.id; beside.push(s.number); }
      doc.sections.push(s); added.push(s.number);
    });
    return { added, beside };
  }

  /* ------------------------------------------------------------------ a client's layout from their Word file */
  async function docxLayout(bytes) {
    const JSZip = await X().zipLib(); const z = await JSZip.loadAsync(bytes);
    const docXml = (await z.file('word/document.xml')?.async('string')) || '', sty = (await z.file('word/styles.xml')?.async('string')) || '';
    const o = { margins: {} };
    const sz = docXml.match(/<w:pgSz [^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/); if (sz) { const w = +sz[1] / 1440, h = +sz[2] / 1440; const best = Object.entries(X().PAGES).find(([, p]) => Math.abs(p[0] - Math.min(w, h)) < 0.2 && Math.abs(p[1] - Math.max(w, h)) < 0.2); if (best) o.page = best[0]; }
    const mg = docXml.match(/<w:pgMar [^>]*>/); if (mg) [['top', 't'], ['right', 'r'], ['bottom', 'b'], ['left', 'l']].forEach(([a, k]) => { const m = mg[0].match(new RegExp('w:' + a + '="(\\d+)"')); if (m) o.margins[k] = Math.round(+m[1] / 1440 * 100) / 100; });
    const defs = sty.match(/<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>/); const font = (defs && defs[0].match(/w:ascii="([^"]+)"/)) || sty.match(/w:ascii="([^"]+)"/); if (font) o.font = /times|georgia|garamond|cambria|book/i.test(font[1]) ? 'Times' : /courier|mono/i.test(font[1]) ? 'Courier' : 'Helvetica';
    const s2 = (defs && defs[0].match(/<w:sz w:val="(\d+)"/)) || docXml.match(/<w:sz w:val="(\d+)"/); if (s2) o.size = +s2[1] / 2;
    if (/w:val="decimalZero"|%1\.0%\d/.test((await z.file('word/numbering.xml')?.async('string')) || '')) o.article_style = '01'; else o.article_style = '1';
    const hdrName = Object.keys(z.files).find(n => /^word\/header\d*\.xml$/.test(n));
    if (hdrName) { const h = await z.file(hdrName).async('string'); const lines = (h.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(p => (p.match(/<w:t[^>]*>[^<]*<\/w:t>|<w:tab\/>/g) || []).map(x => x === '<w:tab/>' ? '\t' : x.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g, '&')).filter(s => s.trim()); if (lines.length) { o.header = { block: lines.join('\n'), left: '', right: '', rule: /<w:pBdr>[\s\S]*?<w:bottom /.test(h), bold: /<w:b\/>|<w:b w:val="1"\/>/.test(h) }; } }
    o.number_style = /SECTION\s+\d{2}\s\d{4}(?!\d)/.test(docXml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')) ? 'compact' : 'spaced';
    return o;
  }

  /* ------------------------------------------------------------------ the import window */
  function style() { if (document.getElementById('spx-css')) return; const st = document.createElement('style'); st.id = 'spx-css'; st.textContent = `.spx .spx-src{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:4px 0 14px}
.spx .spx-card{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid rgba(0,0,0,.18);border-radius:10px;background:#fff;color:#1d1d1f;font:13px/1.4 inherit}
.spx .spx-card b{font-size:14px}.spx .spx-card small{color:#555;font-size:12px}
.spx .spx-card.on{border-color:#1d1d1f;box-shadow:inset 0 0 0 1px #1d1d1f;background:#f6f6f4}
.spx .spx-card[disabled]{opacity:.55;cursor:not-allowed}
.spx .spx-card:focus-visible{outline:2px solid #2b6cb0;outline-offset:2px}
.spx .spx-opt{display:flex;gap:8px;align-items:center;margin:0 0 12px;font-size:13px}
.spx .spx-out{margin-top:14px}
.spx .sp-file{display:inline-flex;align-items:center;justify-content:center;padding:10px 18px;border:1.5px solid #1d1d1f;border-radius:999px;color:#1d1d1f;background:#fff;font-weight:600;cursor:pointer}
.spx .sp-file:hover{background:#f2f2ef}.spx .sp-file:focus-within{outline:2px solid #2b6cb0;outline-offset:2px}
.spx .spx-box{border:1px solid rgba(0,0,0,.14);border-left-width:4px;border-radius:8px;padding:10px 14px;margin:0 0 12px;background:#fff;color:#1d1d1f}
.spx .spx-box.ok{border-left-color:#2f855a}.spx .spx-box.warn{border-left-color:#b7791f}
.spx .spx-box h4{margin:0 0 6px;font-size:14px}.spx .spx-box ul{margin:6px 0;padding-left:18px;font-size:13px}
.spx .spx-list{max-height:220px;overflow:auto}.spx .spx-list small{color:#666;margin-left:6px}`; document.head.appendChild(st); }
  function open(S) {
    const doc = S.doc; if (!doc || doc.kind !== 'spec') return;
    style();
    let source = 'client'; const results = [];
    const canFormat = !!(S.firm && S.firm.id);
    const M = Sp()._modal('Import specifications', 'WORD OR PDF · NOTHING IS REMOVED', `
      <div class="spx-src" role="radiogroup" aria-label="What are you importing?">${Object.entries(SOURCES).map(([k, v]) => `<button type="button" role="radio" class="spx-card ${k === source ? 'on' : ''}" data-src="${k}" aria-checked="${k === source}"><b>${esc(v.label)}</b><small>${esc(v.text)}</small></button>`).join('')}</div>
      <label class="spx-opt" id="spx-fmtopt" ${canFormat ? '' : 'hidden'}><input type="checkbox" id="spx-keepfmt"> Also keep this file’s page layout as a client format (Word template)</label>
      <label class="du-btn ghost sp-file">Choose .docx or .pdf files<input type="file" multiple accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></label>
      <div class="spx-out" aria-live="polite"></div>`, true);
    M.classList.add('spx');
    const q = s => M.querySelector(s);
    M.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { source = b.dataset.src; M.querySelectorAll('[data-src]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); q('#spx-fmtopt').hidden = !(canFormat && source === 'client'); });
    q('#spx-fmtopt').hidden = !(canFormat && source === 'client');
    q('input[type=file]').onchange = async e => {
      const files = Array.from(e.target.files || []); if (!files.length) return; const out = q('.spx-out'); out.innerHTML = '<p class="sp-note">Reading…</p>';
      const sections = [], checks = [];
      for (const f of files) {
        try {
          const bytes = new Uint8Array(await f.arrayBuffer()); const isDocx = /\.docx$/i.test(f.name), isPdf = /\.pdf$/i.test(f.name);
          if (!isDocx && !isPdf) throw new Error('use a Word (.docx) or PDF file');
          const blocks = isDocx ? await readDocx(bytes) : await readPdf(bytes);
          const r = toSections(blocks, { file: f.name, source }); const cov = coverage(blocks, r.sections);
          sections.push(...r.sections); checks.push({ file: f.name, sections: r.sections.length, cov, layoutLines: blocks.layoutLines || 0, bytes: isDocx ? bytes : null, pdf: isPdf });
        } catch (er) { checks.push({ file: f.name, error: er.message || String(er) }); }
      }
      if (!sections.length) { out.innerHTML = `<p class="sp-bad">${checks.map(c => esc(c.file + ': ' + (c.error || 'no text was found'))).join('<br>')}</p>`; return; }
      const fc = formatCheck(sections, doc);
      results.length = 0; results.push({ sections, checks, fc });
      const tot = checks.reduce((a, c) => a + (c.cov ? c.cov.total : 0), 0), kept = checks.reduce((a, c) => a + (c.cov ? c.cov.kept : 0), 0);
      out.innerHTML = `
        <section class="spx-box ${kept === tot ? 'ok' : 'warn'}"><h4>Word-for-word check</h4><p><b>${kept.toLocaleString()} of ${tot.toLocaleString()} words</b> from ${checks.length} file${checks.length === 1 ? '' : 's'} are in the imported sections${kept === tot ? ', in the same order. Nothing was left out.' : '. The words below did not come across; add them by hand or tell us about the file.'}</p>
          <ul>${checks.map(c => `<li>${esc(c.file)}: ${c.error ? `<span class="sp-bad">${esc(c.error)}</span>` : `${c.sections} section${c.sections === 1 ? '' : 's'}, ${c.cov.kept}/${c.cov.total} words${c.cov.missing.length ? ` <span class="sp-bad">missing: “${esc(c.cov.missing.slice(0, 3).join('”, “'))}”</span>` : ''}${c.layoutLines ? `, ${c.layoutLines} page header and footer lines left to the layout` : ''}`}</li>`).join('')}</ul>
          <p class="sp-note">Numbering (PART 1, 1.01, A., 1., a.) and END OF SECTION lines are written by the manual’s format, so they are realigned rather than kept as typed text.</p></section>
        <section class="spx-box ${fc.clean ? 'ok' : 'warn'}"><h4>${source === 'consultant' ? 'Same-format check' : 'Format check'}</h4>${fc.clean ? '<p>Clean: the sections fit the manual’s format.</p>' : `<ul>${fc.issues.map(i => `<li>${esc(i.t)}</li>`).join('')}</ul>${fc.issues.some(i => i.fix === 'typed') ? '<button type="button" class="du-btn ghost" id="spx-strip">Use the manual’s numbering for typed numbers</button>' : ''}`}${fc.info.length ? `<p class="sp-note">${fc.info.map(esc).join('<br>')}</p>` : ''}</section>
        <section class="spx-box"><h4>${sections.length} section${sections.length === 1 ? '' : 's'} to add</h4><ul class="spx-list">${sections.slice(0, 60).map(s => `<li><b>${esc(s.number)}</b> ${esc(s.title)} <small>${[1, 2, 3].map(n => s.parts[n].reduce((a, x) => a + x.paras.length, 0)).join(' / ')} paragraphs</small></li>`).join('')}${sections.length > 60 ? `<li>…and ${sections.length - 60} more</li>` : ''}</ul></section>
        <div class="sp-savebar"><button type="button" class="du-btn primary" id="spx-add">${source === 'consultant' ? 'Merge into this manual' : 'Add to this manual'}</button><span class="sp-st" role="status"></span></div>`;
      const strip = q('#spx-strip'); if (strip) strip.onclick = () => { const n = stripTyped(sections); strip.disabled = true; strip.textContent = `${n} typed number${n === 1 ? '' : 's'} realigned`; };
      q('#spx-add').onclick = async () => {
        const st = q('.sp-st'); const r = merge(doc, sections, source);
        const log = { at: new Date().toISOString(), source, files: checks.map(c => ({ file: c.file, sections: c.sections || 0, words: c.cov ? c.cov.total : 0, kept: c.cov ? c.cov.kept : 0, missing: c.cov ? c.cov.missing : [], error: c.error || null })), added: r.added.length, beside: r.beside, format: { clean: fc.clean, issues: fc.issues.map(i => i.t) } };
        doc.data = Object.assign({}, doc.data, { imports: ((doc.data && doc.data.imports) || []).concat(log).slice(-50) });
        S.secId = sections[0].id; S.part = [1, 2, 3].find(n => sections[0].parts[n].length) || 1; Sp()._dirty(S); Sp()._redraw(S);
        let fmtNote = '';
        if (canFormat && source === 'client' && q('#spx-keepfmt') && q('#spx-keepfmt').checked) {
          const c = checks.find(x => x.bytes); if (c) { try { st.textContent = 'Saving the client format…'; const row = await saveClientFormat(S, c.file, c.bytes); doc.format_id = row.id; Sp()._dirty(S); fmtNote = ' The client format is saved and set for this manual.'; } catch (er) { fmtNote = ' The client format was not saved: ' + (er.message || er); } }
        }
        M.remove();
        settingsCard(S, `${r.added.length} section${r.added.length === 1 ? '' : 's'} added as Draft${r.beside.length ? `; ${r.beside.length} next to a section with the same number` : ''}.${fmtNote}`);
      };
    };
  }
  async function saveClientFormat(S, fileName, bytes) {
    const lay = await docxLayout(bytes); const X0 = X();
    const settings = X0.fixFormat({ ...JSON.parse(JSON.stringify(X0.DRAWUP_FORMAT)), ...lay, margins: { ...X0.DRAWUP_FORMAT.margins, ...lay.margins }, header: { ...X0.DRAWUP_FORMAT.header, ...(lay.header || {}) } });
    const name = fileName.replace(/\.\w+$/, '');
    const kf = await Sp()._uploadSpecFile(S, new File([bytes], fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const r = await S.c.client.from('firm_spec_formats').insert({ firm_id: S.firm.id, kind: 'client', name: 'Client format: ' + name.slice(0, 80), client_name: null, project_thread_id: S.doc.project_thread_id || null, settings, template_file_id: kf.id, reference_file_ids: [kf.id], is_default: false, created_by: S.me, updated_by: S.me }).select('*');
    if (r.error) throw r.error; const row = r.data[0]; S.formats = [row].concat(S.formats || []); return row;
  }
  /** The three layout settings, right after an import: firm standard, client standard, DrawUp standard. */
  function settingsCard(S, msg) {
    const doc = S.doc, F = S.formats || [];
    const firm = F.find(f => f.kind === 'firm' && f.is_default) || F.find(f => f.kind === 'firm');
    const client = F.find(f => f.kind === 'client' && (!f.project_thread_id || f.project_thread_id === doc.project_thread_id));
    const M = Sp()._modal('Choose the layout', 'THREE SETTINGS · LAYOUT ONLY', `<p>${esc(msg)}</p>
      <p class="sp-note">Pick how this manual is laid out. Switching changes numbering style, fonts, header and footer only; the text you imported stays exactly as it is, and you can switch again any time from Format.</p>
      <div class="spx-src">${[['firm', 'Firm standard', firm, firm ? firm.name : 'Not saved yet. Until your firm saves one, the DrawUp standard is used.'], ['client', 'Client standard', client, client ? client.name : 'No client format yet. Import client specs with “keep this file’s page layout”, or add one under Formats.'], ['drawup', 'DrawUp standard', true, 'Built in: the Division 01 layout.']].map(([k, l, row, sub]) => `<button type="button" class="spx-card ${((k === 'drawup' && !doc.format_id) || (row && row.id && row.id === doc.format_id)) ? 'on' : ''}" data-lay="${k}" ${row ? '' : 'disabled'}><b>${esc(l)}</b><small>${esc(sub)}</small></button>`).join('')}</div>`);
    style(); M.classList.add('spx');
    M.querySelectorAll('[data-lay]').forEach(b => b.onclick = () => { const k = b.dataset.lay; doc.format_id = k === 'drawup' ? null : k === 'firm' ? firm.id : client.id; Sp()._dirty(S); Sp()._redraw(S); M.remove(); (S.c.toast || console.log)('Layout set to ' + b.querySelector('b').textContent + '. The text did not change.'); });
  }

  window.DrawUpSpecsImport = { align, open, readDocx, readPdf, classify, toSections, coverage, formatCheck, stripTyped, merge, docxLayout, settingsCard, SOURCES, _words: words };
})();
