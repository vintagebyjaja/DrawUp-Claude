/* DrawUp Season 1 · CheckUp: Specifications Review, DD Readiness and Review History.
 *
 *   #portal/check?mode=specs    Specifications Review
 *   #portal/check?mode=dd       Design development readiness
 *   #portal/check?mode=history  Every review in one list
 *
 * window.DrawUpCheckUp = { reviewSpec, ddReadiness, open, _rules, _report }
 *
 * These two reviews read the member's own records and say what is missing or disagrees:
 *   - the specification itself (project_documents and firm_documents, written in DrawUp Specs)
 *   - Project Information (project_profiles): the project's own values, with their sources
 *   - the project's drawing set and its finished CheckUp reviews (drawup_spec_project_brief)
 * Every finding names the rule it came from and the place it points at, so nothing is a guess dressed up
 * as a conclusion, and no finding is invented: each one is a fact about the member's own documents. No code
 * citation is produced here, and the review is explicitly preliminary, not a licensed review or an approval.
 *
 * The loop Season 1 asked for: write or import a specification in DrawUp Specs, pick the project and its
 * drawings here, run the review, open the section from a finding, edit and save it, re-run, and export the
 * findings as a PDF and as a document saved to the project.
 * It adds to the Check tab by wrapping DrawUpCheckV22.route, so drawing, narrative and portfolio reviews
 * are untouched. Loaded at the end of drawup-preview.html, after the Check and Specs files. */
(function () {
  'use strict';
  if (window.DrawUpCheckUp) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const when = d => d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const day = d => d ? new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const SEV = ['critical', 'major', 'minor', 'info'];
  const bySev = (a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity);
  const X = () => window.DrawUpSpecsExport;
  const D = () => window.DrawUpSpecsData;
  const sqlMissing = e => !!e && (/spec_reviews/.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST205');
  const NOT_APPROVAL = 'This is a preliminary, advisory review of your own documents. It is not a licensed review, a code determination or an approval by the authority having jurisdiction.';

  /* ================================================================== the rules */
  // Each rule says what it looks at and what it means. Nothing here reads a code book or a product catalog.
  const RULES = {
    'open-item': ['An item is still open', 'A blank, a choice or a project value has not been filled in.', 'major'],
    'section-draft': ['Section is still a draft', 'The section has never been moved past Draft, so it is not ready to issue.', 'minor'],
    'part-empty': ['A part of the section is empty', 'SectionFormat expects General, Products and Execution; one of them has nothing in it.', 'major'],
    'no-products': ['No products or materials named', 'Part 2 has no article naming a product, material or system.', 'major'],
    'no-execution': ['No execution requirements', 'Part 3 has nothing about installation, examination or quality.', 'major'],
    'division-01': ['No Division 01 section', 'The manual has no General Requirements section.', 'major'],
    'drawing-gap': ['The drawings show work the manual does not cover', 'A sheet in the drawing set points at work with no section in this manual.', 'major'],
    'value-conflict': ['A value disagrees with Project Information', 'The document states a value that Project Information records differently.', 'critical'],
    'duplicate-section': ['The same section number twice', 'Two sections carry the same number.', 'critical'],
    'cross-ref': ['A referenced section is not in the manual', 'The text sends the reader to a section this manual does not have.', 'major'],
    'empty-para': ['An empty paragraph', 'An article has a paragraph with no text.', 'minor'],
    'check-coordination': ['A drawing review finding touches the specifications', 'A finished CheckUp review raised something the specifications should answer.', 'minor'],
    'outline-note': ['Outline specification', 'This is outline, preliminary content: products and execution are named at DD, not here.', 'info'],
  };
  const fid = (rule, key) => rule + ':' + String(key || '').replace(/\s+/g, '-').slice(0, 80);

  /** The work a sheet points at, kept to what a sheet title plainly says, with the division it belongs to. */
  const SHEET_WORK = [
    [/\broof(ing)?\b/i, '07', 'roofing and moisture protection'],
    [/\bdoor|window|glaz|curtain ?wall|storefront\b/i, '08', 'openings and glazing'],
    [/\bfinish|ceiling|floor(ing)? plan|paint\b/i, '09', 'finishes'],
    [/\bcasework|millwork|cabinet\b/i, '06', 'wood and plastics'],
    [/\bmasonry|brick|cmu\b/i, '04', 'masonry'],
    [/\bmetal|steel|stair\b/i, '05', 'metals'],
    [/\bconcrete|foundation|footing\b/i, '03', 'concrete'],
    [/\bsite|civil|grading|paving|landscap\b/i, '32', 'exterior improvements'],
    [/\belevator|lift\b/i, '14', 'conveying equipment'],
    [/\bplumb\b/i, '22', 'plumbing'],
    [/\bmechanical|hvac\b/i, '23', 'heating, ventilating and air conditioning'],
    [/\belectrical|lighting|power\b/i, '26', 'electrical'],
  ];

  /**
   * reviewSpec(doc, ctx) -> { findings, counts, summary }
   * doc : a DrawUp Specs document ({ kind:'spec', sections:[...], outline })
   * ctx : { values (project data), sheets, reviews, divisions }
   */
  function reviewSpec(doc, ctx) {
    const out = []; const c = ctx || {}; const values = c.values || {};
    const Xp = X(); const DIV = (D() && D().DIVISIONS) || {};
    const secs = (doc.sections || []).filter(s => s.state !== 'excluded');
    const at = s => ({ document_id: doc.id, store: doc.owner_id ? 'project' : 'firm', section_id: s && s.id, section: s ? (s.number + ' ' + s.title) : '', number: s ? s.number : '' });
    const add = (rule, severity, issue, fix, where, extra) => out.push(Object.assign({
      id: fid(rule, (where && where.section_id) + '-' + (issue || '').slice(0, 40)), rule, rule_title: RULES[rule][0], rule_says: RULES[rule][1],
      severity: severity || RULES[rule][2], issue, fix: fix || '', confidence: 'high', source: 'Your own document',
    }, where || {}, extra || {}));

    if (!secs.length) { add('part-empty', 'critical', 'The manual has no sections yet.', 'Add the sections this project needs, or let the drawings suggest them.', at(null)); return finish(out, doc); }

    // duplicate numbers
    const seen = {};
    secs.forEach(s => { const k = String(s.number || '').trim(); if (!k) return; (seen[k] = seen[k] || []).push(s); });
    Object.entries(seen).forEach(([k, list]) => { if (list.length > 1) add('duplicate-section', 'critical', `Section ${k} appears ${list.length} times (${list.map(s => s.title).join(', ')}).`, 'Renumber or merge them so each section number is used once.', at(list[1])); });

    // per section
    const numbers = new Set(secs.map(s => String(s.number || '').replace(/\s+/g, ' ').trim()));
    secs.forEach(s => {
      const parts = s.parts || {}; const openN = Xp.openItems(JSON.stringify(parts), { data: values });
      if (openN) add('open-item', openN > 4 ? 'major' : 'minor', `${openN} item${openN === 1 ? ' is' : 's are'} still open in ${s.number} ${s.title}.`, 'Open the section and fill in each blank, choice and project value.', at(s), { count: openN });
      if (s.state === 'draft') add('section-draft', 'minor', `${s.number} ${s.title} is still marked Draft.`, 'Move it to In progress, In review or Complete as the work goes on.', at(s));
      const partList = doc.outline ? [[2, 'Products']] : [[1, 'General'], [2, 'Products'], [3, 'Execution']];
      partList.forEach(([n, label]) => {
        const arts = (parts[n] || []).filter(a => !a.off);
        const text = arts.map(a => (a.paras || []).map(p => p.t).join(' ')).join(' ').trim();
        if (!arts.length || !text) {
          if (n === 2) add('no-products', 'major', `${s.number} ${s.title} has no products or materials in Part 2.`, 'Name the products, materials or systems this section covers, with their performance criteria.', at(s), { part: n });
          else if (n === 3) add('no-execution', 'major', `${s.number} ${s.title} has nothing in Part 3.`, 'Say how the work is examined, installed and checked.', at(s), { part: n });
          else add('part-empty', 'major', `${s.number} ${s.title} has nothing in Part ${n} (${label}).`, `Write the ${label.toLowerCase()} requirements, or leave the section out of the manual.`, at(s), { part: n });
        }
        arts.forEach(a => (a.paras || []).forEach(p => { if (!String(p.t || '').trim()) add('empty-para', 'minor', `An empty paragraph in ${s.number}, ${a.title || 'an article'} (Part ${n}).`, 'Write the paragraph or remove it.', at(s), { part: n, article_id: a.id, para_id: p.id }); }));
        // a reference to a section the manual does not have
        arts.forEach(a => (a.paras || []).forEach(p => {
          const t = String(p.t || ''); const re = /\bSection\s+(\d{2}\s?\d{2}\s?\d{2})/gi; let m;
          while ((m = re.exec(t))) { const ref = m[1].replace(/(\d{2})\s?(\d{2})\s?(\d{2})/, '$1 $2 $3'); if (ref !== String(s.number).trim() && !numbers.has(ref)) add('cross-ref', 'major', `${s.number} points at Section ${ref}, which is not in this manual.`, `Add Section ${ref} or change the reference.`, at(s), { part: n, article_id: a.id, para_id: p.id, ref }); }
        }));
      });
    });

    // Division 01
    if (!secs.some(s => /^01\b/.test(String(s.number || '')))) add('division-01', 'major', 'The manual has no Division 01 General Requirements section.', 'Add the Division 01 sections this project needs (summary, submittals, quality requirements, closeout).', at(null));

    // the drawings show work the manual does not cover
    const divs = new Set(secs.map(s => String(s.number || '').slice(0, 2)));
    const sheets = c.sheets || []; const flagged = new Set();
    sheets.forEach(sh => {
      const t = [sh.sheet_title, sh.sheet_number].filter(Boolean).join(' ');
      SHEET_WORK.forEach(([re, dv, what]) => {
        if (!re.test(t) || divs.has(dv) || flagged.has(dv)) return;
        flagged.add(dv);
        add('drawing-gap', 'major', `Sheet ${sh.sheet_number || ''} ${sh.sheet_title || ''} shows ${what}, and the manual has no Division ${dv} section.`.replace(/\s+/g, ' ').trim(),
          `Add a Division ${dv}${DIV[dv] ? ' ' + DIV[dv] : ''} section, or confirm the work is covered elsewhere.`, at(null), { confidence: 'medium', source: 'Your drawing set, read from the sheet title', division: dv, sheet: sh.sheet_number || '' });
      });
    });

    // a value in the text that Project Information records differently
    const checkFields = [['project_number', 'project number'], ['project_name', 'project name'], ['site_address', 'site address'], ['owner_name', 'owner']];
    const all = secs.map(s => JSON.stringify(s.parts)).join(' ');
    checkFields.forEach(([k, label]) => {
      const v = values[k]; if (!v || String(v).length < 4) return;
      const token = '<<' + k + '>>';
      if (all.includes(token)) return; // linked: it cannot disagree
      // a different value of the same shape, written out in the text
      if (k === 'project_number') { const m = all.match(/\b(20\d\d[-–]\d{2,4})\b/); if (m && m[1] !== String(v)) add('value-conflict', 'critical', `The text says project number ${m[1]}; Project Information records ${v}.`, `Use the linked field ${token} so the number is written once.`, at(null), { source: 'Project Information', field: k, found: m[1], recorded: String(v) }); }
      if (k === 'owner_name' || k === 'project_name' || k === 'site_address') {
        const esc2 = String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(esc2.slice(0, 24), 'i').test(all)) add('value-conflict', 'minor', `The ${label} from Project Information (${v}) is not written anywhere in the manual.`, `Insert the linked field ${token} where the ${label} belongs, so it stays right everywhere.`, at(null), { source: 'Project Information', field: k, recorded: String(v) });
      }
    });

    // spec-related findings from a finished drawing review
    (c.reviews || []).forEach(rv => (Array.isArray(rv.findings) ? rv.findings : []).forEach(f => {
      const txt = [f.issue, f.recommendation].filter(Boolean).join(' ');
      if (!/spec|material|product|assembly|finish|submittal|warrant/i.test(txt)) return;
      add('check-coordination', f.severity === 'critical' ? 'major' : 'minor', `${f.sheet ? f.sheet + ': ' : ''}${f.issue}`.slice(0, 300), f.recommendation ? ('In the specifications: ' + f.recommendation).slice(0, 300) : 'Answer this in the section that covers the work.', at(null), { confidence: f.confidence || 'medium', source: 'Your CheckUp drawing review', sheet: f.sheet || '' });
    }));

    if (doc.outline) add('outline-note', 'info', 'This is an outline specification, so Part 1 and Part 3 are not expected yet.', 'At design development each section is written out in full.', at(null));
    return finish(out, doc);
  }
  function finish(out, doc) {
    const findings = out.sort(bySev);
    const counts = SEV.reduce((a, s) => (a[s] = findings.filter(f => f.severity === s).length, a), {});
    const n = findings.filter(f => f.severity !== 'info').length;
    const summary = n
      ? `${n} item${n === 1 ? '' : 's'} to settle in ${doc.title}: ${SEV.filter(s => counts[s] && s !== 'info').map(s => counts[s] + ' ' + s).join(', ')}. Each one points at the section it came from.`
      : `Nothing outstanding was found in ${doc.title}. Open items, empty parts, numbering, cross references and the project's own values all check out.`;
    return { findings, counts, summary };
  }

  /* ================================================================== DD readiness */
  /** A prioritized checklist: what is in place, what is missing, and what to settle before DD. */
  function ddReadiness(input) {
    const I = input || {}; const V = I.values || {}; const P = I.profile || {}; const items = [];
    const item = (key, title, state, why, next, weight, where) => items.push({ id: key, title, state, why, next: next || '', weight: weight || 1, where: where || '' });
    const has = k => !!(V[k] && String(V[k]).trim());

    // A. the project's own record
    const siteKeys = ['site_address', 'county', 'municipality', 'jurisdiction'];
    const siteHave = siteKeys.filter(has).length;
    item('site', 'Site and jurisdiction recorded', siteHave >= 3 ? 'done' : siteHave ? 'partial' : 'missing',
      siteHave ? `${siteHave} of ${siteKeys.length} recorded.` : 'Project Information has no site yet.', 'Projects › Project Information', 3, 'project-info');
    const zoneKeys = ['zoning_district', 'setbacks', 'height_limit'];
    const zoneHave = zoneKeys.filter(has).length;
    item('zoning', 'Zoning, setbacks and height limit confirmed', zoneHave === 3 ? 'done' : zoneHave ? 'partial' : 'missing',
      zoneHave ? `${zoneHave} of 3 recorded.` : 'DrawUp could not look these up for this jurisdiction, so they have to be entered from the ordinance or the AHJ.', 'Projects › Project Information', 3, 'project-info');
    const verified = Object.values(P.fields || {}).filter(f => f && f.verified).length;
    item('verified', 'Site values checked against the source', verified >= 3 ? 'done' : verified ? 'partial' : 'missing',
      verified ? `${verified} value${verified === 1 ? '' : 's'} marked as checked.` : 'Nothing has been marked as checked yet. Looked-up values are unverified until someone confirms them.', 'Projects › Project Information', 2, 'project-info');

    // B. program and areas
    const prog = (P.program || []).filter(r => r && (r.name || r.space));
    const areas = prog.filter(r => Number(r.area) > 0);
    const total = areas.reduce((a, r) => a + Number(r.area || 0) * (Number(r.count) || 1), 0);
    item('program', 'Building program recorded', prog.length ? (areas.length === prog.length ? 'done' : 'partial') : 'missing',
      prog.length ? `${prog.length} space${prog.length === 1 ? '' : 's'}, ${areas.length} with an area${total ? `, ${Math.round(total).toLocaleString()} sq ft in all` : ''}.` : 'No program yet.',
      'Projects › Project Information › Program', 3, 'project-info');
    item('areas', 'Area summary adds up', total > 0 ? (areas.length === prog.length ? 'done' : 'partial') : 'missing',
      total > 0 ? `${Math.round(total).toLocaleString()} sq ft from the program.${areas.length === prog.length ? '' : ' Some spaces have no area.'}` : 'No areas to add up yet.',
      'Projects › Project Information › Program', 2, 'project-info');

    // C. team and schedule
    const team = (P.team || []).filter(t => t && (t.name || t.role));
    item('team', 'Team and consultants named', team.length >= 3 ? 'done' : team.length ? 'partial' : 'missing',
      team.length ? `${team.length} named.` : 'No team or consultants recorded, so coordination has nobody attached to it.', 'Projects › Project Information › Team', 2, 'project-info');
    const ms = (P.milestones || []).filter(m => m && m.name);
    item('milestones', 'Milestones set', ms.length ? 'done' : 'missing', ms.length ? `${ms.length} recorded.` : 'No dates recorded for SD, DD or the client reviews.', 'Projects › Project Information › Milestones', 1, 'project-info');

    // D. decisions still open
    const dec = (P.decisions || []).filter(d => d && d.what);
    const open = dec.filter(d => (d.status || 'open') !== 'decided');
    item('decisions', 'Design decisions settled', dec.length ? (open.length ? 'partial' : 'done') : 'missing',
      dec.length ? (open.length ? `${open.length} of ${dec.length} still open: ${open.slice(0, 4).map(d => d.what).join('; ')}${open.length > 4 ? '…' : ''}` : `All ${dec.length} recorded as decided.`) : 'No decisions recorded, so there is nothing to hand to DD.',
      'Projects › Project Information › Decisions', 3, 'project-info');

    // E. drawings
    const sheets = I.sheets || [];
    item('sheets', 'Schematic drawings in the set', sheets.length >= 4 ? 'done' : sheets.length ? 'partial' : 'missing',
      sheets.length ? `${sheets.length} sheet${sheets.length === 1 ? '' : 's'}: ${sheets.slice(0, 6).map(s => s.sheet_number).filter(Boolean).join(', ')}${sheets.length > 6 ? '…' : ''}` : 'No drawing set filed for this project.',
      'Draw › Drawing sets', 3, 'projects');

    // F. specifications
    const specs = I.specs || [];
    const specOpen = I.specFindings ? I.specFindings.filter(f => f.severity !== 'info').length : null;
    item('specs', 'Outline specification started', specs.length ? (specOpen ? 'partial' : 'done') : 'missing',
      specs.length ? `${specs.length} specification document${specs.length === 1 ? '' : 's'}${specOpen == null ? '' : `, ${specOpen} item${specOpen === 1 ? '' : 's'} outstanding in the one reviewed`}.` : 'No outline specification or project manual for this project yet.',
      specs.length ? 'CheckUp › Specifications Review' : 'Projects › Specifications', 3, 'specs');

    // G. preliminary code and accessibility
    const checks = I.reviews || [];
    const done = checks.filter(r => r.status === 'complete');
    const crit = done.reduce((a, r) => a + (Array.isArray(r.findings) ? r.findings.filter(f => f.severity === 'critical' || f.severity === 'major').length : 0), 0);
    item('code', 'Preliminary code and accessibility review run', done.length ? (crit ? 'partial' : 'done') : 'missing',
      done.length ? `${done.length} finished review${done.length === 1 ? '' : 's'}${crit ? `, ${crit} critical or major finding${crit === 1 ? '' : 's'} still listed` : ', nothing critical outstanding'}.` : 'No CheckUp review has been run on this project\'s drawings.',
      'CheckUp › Code Compliance', 3, 'check');
    item('code_edition', 'Code edition and AHJ confirmed', has('code_edition') ? 'done' : 'missing',
      has('code_edition') ? String(V.code_edition) : 'The adopted code edition is not recorded. DrawUp does not assume one: it has to come from the authority having jurisdiction.',
      'Projects › Project Information', 3, 'project-info');

    // H. the package
    const docs = I.documents || [];
    const kinds = new Set(docs.map(d => d.doc_type));
    item('narrative', 'Design narrative or SD report written', kinds.has('narrative') || kinds.has('kickoff') ? 'done' : 'missing',
      kinds.has('narrative') ? 'A narrative or report is filed under this project.' : 'No narrative or SD report for this project yet.', 'Projects › Documents', 2, 'documents');
    item('package', 'Client package assembled', docs.length >= 2 ? 'done' : docs.length ? 'partial' : 'missing',
      docs.length ? `${docs.length} document${docs.length === 1 ? '' : 's'} filed under this project.` : 'No documents filed under this project.', 'Projects › Documents', 1, 'documents');

    const w = items.reduce((a, i) => a + i.weight, 0);
    const got = items.reduce((a, i) => a + i.weight * (i.state === 'done' ? 1 : i.state === 'partial' ? 0.5 : 0), 0);
    const score = Math.round((got / Math.max(1, w)) * 100);
    const order = { missing: 0, partial: 1, done: 2 };
    items.sort((a, b) => (order[a.state] - order[b.state]) || (b.weight - a.weight) || a.title.localeCompare(b.title));
    const miss = items.filter(i => i.state !== 'done');
    const summary = miss.length
      ? `${miss.length} of ${items.length} items are not settled yet. The ones that hold DD up most: ${miss.slice(0, 3).map(i => i.title.toLowerCase()).join('; ')}.`
      : `Every item on this checklist is in place. The design team still decides when DD starts.`;
    return { items, score, summary, findings: items.map(i => ({ id: i.id, severity: i.state === 'missing' ? (i.weight >= 3 ? 'major' : 'minor') : i.state === 'partial' ? 'minor' : 'info', issue: i.title + ' — ' + i.why, fix: i.next ? 'Where: ' + i.next : '', rule: 'dd-' + i.id, rule_title: i.title, rule_says: i.why, severity_state: i.state, source: 'Your project records', confidence: 'high', where_tab: i.where })) };
  }

  /* ================================================================== data */
  async function projects(c) {
    const r = await c.client.from('project_threads').select('id,project_name,project_type,location,project_phase,starter_key,status,updated_at').eq('owner_id', c.user.id).order('updated_at', { ascending: false }).limit(100);
    return (r.data || []).filter(p => p.status !== 'archived');
  }
  async function specDocs(c, pid) {
    const out = [];
    const mine = await c.client.from('project_documents').select('*').eq('owner_id', c.user.id).order('updated_at', { ascending: false }).limit(200);
    if (!mine.error) out.push(...(mine.data || []).map(r => ({ ...r, store: 'project' })));
    const firm = await c.client.from('firm_documents').select('*').order('updated_at', { ascending: false }).limit(200);
    if (!firm.error) out.push(...(firm.data || []).map(r => ({ ...r, store: 'firm' })));
    return out.filter(r => ['spec', 'outline_spec'].includes(r.doc_type) && (!pid || r.project_thread_id === pid));
  }
  async function allDocs(c, pid) {
    const r = await c.client.from('project_documents').select('id,doc_type,title,project_thread_id,updated_at').eq('owner_id', c.user.id).limit(300);
    return (r.data || []).filter(d => !pid || d.project_thread_id === pid);
  }
  const asSpecDoc = row => ({ id: row.id, owner_id: row.owner_id, firm_id: row.firm_id, title: row.title, doc_type: row.doc_type, kind: 'spec', project_thread_id: row.project_thread_id, store: row.store, outline: !!(row.fields && row.fields.outline) || row.doc_type === 'outline_spec', sections: Array.isArray(row.sections) ? row.sections : [], updated_at: row.updated_at });
  async function brief(c, pid) { if (!pid) return { sheets: [], reviews: [] }; const r = await c.client.rpc('drawup_spec_project_brief', { p_project: pid }); const b = (r.data && typeof r.data === 'object') ? r.data : {}; return { sheets: Array.isArray(b.sheets) ? b.sheets : [], reviews: Array.isArray(b.reviews) ? b.reviews : [] }; }
  async function intel(pid) { try { const d = await window.DrawUpProjectInfo.data(pid); return d || null; } catch (_e) { return null; } }

  /* ================================================================== the report */
  /** A findings report as a DrawUp document: downloaded as PDF and saved to the project, nothing invented. */
  function reportDoc(o) {
    const Xp = X(); const blocks = [];
    const p = (h, t) => blocks.push({ id: Xp.rid(), h: h || '', p: t });
    const tbl = (h, cols, rows) => blocks.push({ id: Xp.rid(), h, table: { cols, rows } });
    p('', `${o.kicker}\n${o.project ? o.project + '\n' : ''}Run ${day(new Date())}${o.documentTitle ? ' on ' + o.documentTitle : ''}.`);
    p('Summary', o.summary);
    if (o.score != null) p('Advisory readiness', `${o.score} out of 100. This is an advisory measure of how much of the checklist below is in place. It is not a prediction, a grade or an approval.`);
    if (o.rows && o.rows.length) tbl('Findings', o.cols, o.rows);
    if (o.resolved && o.resolved.length) tbl('Settled since the last run', ['Item'], o.resolved.map(r => [r]));
    p('How this review was made', o.how);
    p('Limits', NOT_APPROVAL);
    return { id: null, kind: 'letter', doc_type: 'narrative', type_label: 'Report', title: o.title, heading: o.kicker, doc_number: '', status: 'draft', project_thread_id: o.pid || null, format_id: null, data: {}, fields: [{ k: 'date', label: 'Date', v: day(new Date()) }, { k: 're', label: 'Re', v: o.title }], blocks };
  }
  async function downloadReport(doc, values) {
    const Xp = X();
    const r = await Xp.pdf(doc, { data: Object.assign({ today: day(new Date()) }, values || {}), labels: {} }, { page: 'letter', orientation: 'portrait' }, {});
    const blob = new Blob([r.bytes], { type: 'application/pdf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (doc.title || 'review').replace(/[^\w.-]+/g, '-').slice(0, 60) + '.pdf';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  async function saveReport(c, doc) {
    const row = { owner_id: c.user.id, created_by: c.user.id, updated_by: c.user.id, source: 'check', doc_type: 'narrative', title: doc.title.slice(0, 200), project_thread_id: doc.project_thread_id || null, status: 'draft', sections: doc.blocks, fields: { list: doc.fields, heading: doc.heading }, cover: { data: {} } };
    const r = await c.client.from('project_documents').insert(row).select('id').single();
    if (r.error) throw r.error;
    return r.data.id;
  }

  /* ================================================================== screens */
  const head = (kicker, title, text, actions) => `<div class="du-work-head"><div><span class="du-kicker">${esc(kicker)}</span><h1>${esc(title)}</h1><p>${esc(text)}</p></div><div class="du-head-actions">${actions || ''}</div></div>`;
  const back = () => '<button class="du-btn ghost" data-cu-back>All checks</button>';
  const toTab = (c, tab, hash) => { if (hash) history.replaceState(null, '', hash); c.openPortalTab(tab); };

  async function renderSpecs(w, c, params) {
    w.innerHTML = '<div class="du-loading">LOADING SPECIFICATIONS REVIEW…</div>';
    const [projs, saved] = await Promise.all([projects(c), c.client.from('spec_reviews').select('*').eq('owner_id', c.user.id).eq('kind', 'specs').order('created_at', { ascending: false }).limit(30)]);
    const missing = sqlMissing(saved.error);
    let pid = params.get('project') || '';
    let docs = await specDocs(c, pid || null);
    if (!pid && !docs.length) docs = await specDocs(c, null);
    let docId = params.get('doc') || (docs[0] ? docs[0].id : '');
    let run = null, openId = params.get('review') || '';
    const rows = saved.data || [];
    // the last review of this specification, so a re-run updates it and can say what was settled
    const lastFor = id => rows.find(x => x.document_id === id) || null;
    run = openId ? (rows.find(x => x.id === openId) || null) : lastFor(docId);

    const draw = () => {
      const picked = docs.find(d => d.id === docId) || null;
      w.innerHTML = head('CHECKUP · SPECIFICATIONS REVIEW', 'Specifications Review',
        'DrawUp reads the specification you wrote, the project\'s own information and its drawing set, and says what is missing, what does not add up and what disagrees. Every finding opens the section it came from, so you can fix it and run the review again.',
        back() + '<button class="du-btn ghost" data-cu-open-specs>Open DrawUp Specs</button>') + `
      <article class="du-glass cu-pick">
        <div class="cu-row2">
          <label><span>Project</span><select class="cu-in" data-cu="project"><option value="">Any project</option>${projs.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select></label>
          <label><span>Specification</span><select class="cu-in" data-cu="doc">${docs.length ? docs.map(d => `<option value="${d.id}" ${d.id === docId ? 'selected' : ''}>${esc(d.title)}${d.store === 'firm' ? ' (firm)' : ''}</option>`).join('') : '<option value="">No specification yet</option>'}</select></label>
        </div>
        <p class="cu-note">${docs.length ? 'The drawing set and the finished CheckUp reviews of the project you pick are read too, so the review can say where the drawings and the manual disagree.' : 'Write a project manual or an outline specification in DrawUp Specs first, or import one. Then it can be reviewed here.'}</p>
        <div class="cu-bar"><button class="du-btn primary" data-cu-run ${docs.length ? '' : 'disabled'}>${run ? 'Run the review again' : 'Run the review'}</button><span class="cu-st" role="status"></span></div>
        ${missing ? '<p class="cu-bad">Run the CheckUp SQL (0078) in Supabase to keep these reviews.</p>' : ''}
      </article>
      <div class="cu-out"></div>
      ${rows.length ? `<article class="du-glass cu-prev"><h2>Earlier specification reviews</h2>${rows.map(r => `<div class="du-row" data-cu-rev="${r.id}" tabindex="0" role="button"><div><b>${esc(r.title)}</b><small>${esc(r.document_title || '')} · ${when(r.created_at)}${(r.runs || []).length > 1 ? ` · ${r.runs.length} runs` : ''}</small></div><div><span class="du-status-pill" data-state="${(r.findings || []).some(f => f.severity === 'critical') ? 'critical' : (r.findings || []).length ? 'major' : 'complete'}">${(r.findings || []).filter(f => f.severity !== 'info').length} OPEN</span></div></div>`).join('')}</article>` : ''}`;
      w.querySelector('[data-cu-back]').onclick = () => toTab(c, 'check', '#portal/check');
      w.querySelector('[data-cu-open-specs]').onclick = () => toTab(c, 'firm', '#portal/firm?pane=specs' + (docId && picked && picked.store === 'firm' ? '&doc=' + docId : ''));
      w.querySelector('[data-cu="project"]').onchange = async e => { pid = e.target.value; docs = await specDocs(c, pid || null); docId = docs[0] ? docs[0].id : ''; run = lastFor(docId); draw(); };
      w.querySelector('[data-cu="doc"]').onchange = e => { docId = e.target.value; run = lastFor(docId); draw(); };
      w.querySelector('[data-cu-run]').onclick = () => go();
      w.querySelectorAll('[data-cu-rev]').forEach(el => { const open = async () => { const r = rows.find(x => x.id === el.dataset.cuRev); if (!r) return; run = r; docId = r.document_id || docId; pid = r.project_thread_id || pid; docs = await specDocs(c, pid || null); draw(); }; el.onclick = open; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }; });
      if (run) showRun(run);
    };

    const go = async () => {
      const st = w.querySelector('.cu-st'); st.textContent = 'Reading the specification…';
      try {
        const row = docs.find(d => d.id === docId); if (!row) throw new Error('Pick a specification first.');
        const doc = asSpecDoc(row);
        const [b, info] = await Promise.all([brief(c, row.project_thread_id || pid || null), (row.project_thread_id || pid) ? intel(row.project_thread_id || pid) : null]);
        const values = Object.assign({}, (info && info.values) || {});
        if (info && info.project) Object.assign(values, { project_name: values.project_name || info.project.project_name, building_type: values.building_type || info.project.project_type });
        const res = reviewSpec(doc, { values, sheets: b.sheets, reviews: b.reviews });
        const before = run ? (run.findings || []) : [];
        const nowIds = new Set(res.findings.map(f => f.id));
        const settled = before.filter(f => !nowIds.has(f.id) && f.severity !== 'info');
        const runs = (run ? (run.runs || []) : []).concat([{ at: new Date().toISOString(), open: res.findings.filter(f => f.severity !== 'info').length, settled: settled.length }]);
        const rec = {
          owner_id: c.user.id, project_thread_id: row.project_thread_id || pid || null, kind: 'specs',
          title: 'Specifications review — ' + row.title, document_id: row.id, document_store: row.store, document_title: row.title,
          status: 'complete', summary: res.summary, findings: res.findings, resolved: settled.map(f => f.issue), runs: runs.slice(-20),
        };
        let out = Object.assign({ id: run && run.document_id === row.id ? run.id : null, created_at: new Date().toISOString() }, rec);
        if (!missing) {
          if (out.id) { const u = await c.client.from('spec_reviews').update(rec).eq('id', out.id).select('*').single(); if (!u.error) { out = u.data; const k = rows.findIndex(x => x.id === out.id); if (k >= 0) rows[k] = out; } }
          else { const i = await c.client.from('spec_reviews').insert(rec).select('*').single(); if (!i.error) { out = i.data; rows.unshift(out); } else if (!sqlMissing(i.error)) throw i.error; }
        }
        run = out; st.textContent = ''; draw();
      } catch (e) { st.textContent = 'Not run: ' + (e.message || e); }
    };

    const showRun = r => {
      const box = w.querySelector('.cu-out'); const fs = (r.findings || []).slice().sort(bySev);
      const counts = SEV.map(s => [s, fs.filter(f => f.severity === s).length]);
      box.innerHTML = `<div class="du-stats">${counts.map(([s, n]) => `<article class="du-stat du-sev-${s}"><span>${s.toUpperCase()}</span><strong>${n}</strong></article>`).join('')}</div>
      <article class="du-glass"><div class="cu-head2"><h2>${esc(r.document_title || 'Specification')}</h2><div class="cu-bar"><button class="du-btn ghost" data-cu-pdf>Download findings (PDF)</button><button class="du-btn ghost" data-cu-save>Save as a project document</button><span class="cu-st2" role="status"></span></div></div>
      <p>${esc(r.summary || '')}</p>
      ${(r.resolved || []).length ? `<p class="cu-ok"><b>Settled since the last run:</b> ${r.resolved.map(x => esc(x)).join(' · ')}</p>` : ''}
      ${(r.runs || []).length > 1 ? `<p class="du-muted">${r.runs.length} runs: ${r.runs.map(x => `${when(x.at)} (${x.open} open${x.settled ? `, ${x.settled} settled` : ''})`).join(' → ')}</p>` : ''}
      <p class="du-muted">${esc(NOT_APPROVAL)}</p></article>
      <article class="du-glass"><h2>Findings</h2>${fs.length ? `<div class="du-findings">${fs.map(f => `<div class="du-finding du-sev-${f.severity}"><div class="du-finding-head"><span class="du-status-pill" data-state="${f.severity}">${f.severity.toUpperCase()}</span><b>${esc(f.section || f.rule_title)}</b><small>${esc(f.rule_title)} · ${esc(f.confidence || 'high')} confidence</small></div><p>${esc(f.issue)}</p>${f.fix ? `<p class="du-muted"><b>Fix:</b> ${esc(f.fix)}</p>` : ''}<p class="cu-src"><b>Why:</b> ${esc(f.rule_says || '')} <i>Read from: ${esc(f.source || 'your document')}.</i></p>${f.section_id || f.document_id ? `<button class="du-btn ghost cu-open" data-cu-sec="${esc(f.section_id || '')}" data-cu-doc="${esc(f.document_id || '')}" data-cu-store="${esc(f.store || '')}">Open the section</button>` : ''}</div>`).join('')}</div>` : '<p>Nothing outstanding.</p>'}</article>`;
      box.querySelectorAll('[data-cu-sec]').forEach(b2 => b2.onclick = () => openSection(c, b2.dataset.cuDoc, b2.dataset.cuStore, b2.dataset.cuSec));
      box.querySelector('[data-cu-pdf]').onclick = async () => { const st = box.querySelector('.cu-st2'); st.textContent = 'Building the PDF…'; try { await downloadReport(reportFor(r), {}); st.textContent = ''; } catch (e) { st.textContent = 'Not built: ' + (e.message || e); } };
      box.querySelector('[data-cu-save]').onclick = async () => { const st = box.querySelector('.cu-st2'); st.textContent = 'Saving…'; try { const id = await saveReport(c, reportFor(r)); st.textContent = 'Saved to Documents.'; if (!missing && r.id) await c.client.from('spec_reviews').update({ report_document_id: id }).eq('id', r.id); } catch (e) { st.textContent = 'Not saved: ' + (e.message || e); } };
    };
    const reportFor = r => reportDoc({
      kicker: 'CheckUp · Specifications Review', title: r.title, pid: r.project_thread_id, documentTitle: r.document_title,
      project: (projs.find(p => p.id === r.project_thread_id) || {}).project_name || '', summary: r.summary || '',
      cols: ['Severity', 'Where', 'What was found', 'Fix', 'Read from'],
      rows: (r.findings || []).slice().sort(bySev).map(f => [f.severity, f.section || '—', f.issue, f.fix || '', f.source || '']),
      resolved: r.resolved || [],
      how: 'DrawUp read the specification sections you wrote, this project\'s own information (with the source of each value) and the project\'s drawing set and finished CheckUp reviews. Each finding names the rule it came from. No code book, product catalog or manufacturer information was used, and no code citation was produced.',
    });
    draw();
  }

  async function openSection(c, docId, store, secId) {
    if (secId) { try { sessionStorage.setItem('du-specs-section', secId); } catch (_e) { /* private mode */ } }
    if (store === 'firm') { try { sessionStorage.setItem('du-specs-open', docId); } catch (_e) { /* ignore */ } toTab(c, 'firm', '#portal/firm?pane=specs&doc=' + docId); return; }
    try { sessionStorage.setItem('du-specs-open', docId); } catch (_e) { /* ignore */ }
    toTab(c, 'documents', '#portal/documents?doc=' + docId);
  }

  async function renderDD(w, c, params) {
    w.innerHTML = '<div class="du-loading">LOADING DD READINESS…</div>';
    const [projs, saved] = await Promise.all([projects(c), c.client.from('spec_reviews').select('*').eq('owner_id', c.user.id).eq('kind', 'dd_readiness').order('created_at', { ascending: false }).limit(30)]);
    const missing = sqlMissing(saved.error); const rows = saved.data || [];
    let pid = params.get('project') || (projs[0] ? projs[0].id : ''); let run = null;
    const openId = params.get('review') || ''; if (openId) run = rows.find(r => r.id === openId) || null;

    const draw = () => {
      w.innerHTML = head('CHECKUP · DD READINESS', 'Design development readiness',
        'A prioritized checklist of what is settled and what is not, taken from this project\'s own records: its information and sources, program and areas, team, milestones, open decisions, drawings, specifications, finished reviews and documents.',
        back()) + `
      <article class="du-glass cu-pick"><div class="cu-row2"><label><span>Project</span><select class="cu-in" data-cu="project">${projs.length ? projs.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.project_name)}</option>`).join('') : '<option value="">No projects yet</option>'}</select></label></div>
      <div class="cu-bar"><button class="du-btn primary" data-cu-run ${projs.length ? '' : 'disabled'}>${run ? 'Check again' : 'Check readiness'}</button><span class="cu-st" role="status"></span></div>
      ${missing ? '<p class="cu-bad">Run the CheckUp SQL (0078) in Supabase to keep these reviews.</p>' : ''}</article>
      <div class="cu-out"></div>
      ${rows.length ? `<article class="du-glass cu-prev"><h2>Earlier readiness checks</h2>${rows.map(r => `<div class="du-row" data-cu-rev="${r.id}" tabindex="0" role="button"><div><b>${esc(r.title)}</b><small>${when(r.created_at)}</small></div><div><span class="du-status-pill" data-state="${r.score >= 80 ? 'complete' : r.score >= 50 ? 'major' : 'critical'}">${r.score == null ? '—' : r.score + ' / 100'}</span></div></div>`).join('')}</article>` : ''}`;
      w.querySelector('[data-cu-back]').onclick = () => toTab(c, 'check', '#portal/check');
      const sel = w.querySelector('[data-cu="project"]'); if (sel) sel.onchange = e => { pid = e.target.value; run = null; draw(); };
      w.querySelector('[data-cu-run]').onclick = () => go();
      w.querySelectorAll('[data-cu-rev]').forEach(el => { const open = () => { run = rows.find(x => x.id === el.dataset.cuRev) || null; if (run) pid = run.project_thread_id || pid; draw(); }; el.onclick = open; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }; });
      if (run) showRun(run);
    };

    const go = async () => {
      const st = w.querySelector('.cu-st'); st.textContent = 'Reading the project…';
      try {
        if (!pid) throw new Error('Pick a project first.');
        const [info, b, specs, docs] = await Promise.all([intel(pid), brief(c, pid), specDocs(c, pid), allDocs(c, pid)]);
        let specFindings = null;
        if (specs.length) { const r0 = reviewSpec(asSpecDoc(specs[0]), { values: (info && info.values) || {}, sheets: b.sheets, reviews: b.reviews }); specFindings = r0.findings; }
        const res = ddReadiness({ values: (info && info.values) || {}, profile: (info && info.profile) || {}, sheets: b.sheets, reviews: b.reviews, specs, specFindings, documents: docs });
        const rec = { owner_id: c.user.id, project_thread_id: pid, kind: 'dd_readiness', title: 'DD readiness — ' + ((projs.find(p => p.id === pid) || {}).project_name || 'project'), status: 'complete', score: res.score, summary: res.summary, findings: res.findings, resolved: [], runs: ((run && run.runs) || []).concat([{ at: new Date().toISOString(), score: res.score }]).slice(-20) };
        let out = Object.assign({ id: run ? run.id : null, created_at: new Date().toISOString() }, rec); out.items = res.items;
        if (!missing) {
          if (out.id) { const u = await c.client.from('spec_reviews').update(rec).eq('id', out.id).select('*').single(); if (!u.error) out = Object.assign(u.data, { items: res.items }); }
          else { const i = await c.client.from('spec_reviews').insert(rec).select('*').single(); if (!i.error) { out = Object.assign(i.data, { items: res.items }); rows.unshift(out); } else if (!sqlMissing(i.error)) throw i.error; }
        }
        run = out; st.textContent = ''; draw();
      } catch (e) { st.textContent = 'Not checked: ' + (e.message || e); }
    };

    const showRun = r => {
      const box = w.querySelector('.cu-out');
      const items = r.items || (r.findings || []).map(f => ({ id: f.id, title: f.rule_title, state: f.severity_state || (f.severity === 'info' ? 'done' : 'missing'), why: f.rule_says || f.issue, next: (f.fix || '').replace(/^Where: /, ''), where: f.where_tab || '' }));
      const n = items.filter(i => i.state !== 'done').length;
      box.innerHTML = `<article class="du-glass cu-score"><div><span class="du-kicker">ADVISORY READINESS</span><strong>${r.score == null ? '—' : r.score}<small> / 100</small></strong><p class="du-muted">How much of the checklist is in place. It is advisory, not a prediction, a grade or an approval; the design team decides when DD starts.</p></div><div class="cu-bar"><button class="du-btn ghost" data-cu-pdf>Download checklist (PDF)</button><button class="du-btn ghost" data-cu-save>Save as a project document</button><span class="cu-st2" role="status"></span></div></article>
      <article class="du-glass"><h2>${n ? n + ' item' + (n === 1 ? '' : 's') + ' to settle' : 'Everything on the checklist is in place'}</h2><p>${esc(r.summary || '')}</p>
      <ul class="cu-list">${items.map(i => `<li class="cu-${i.state}"><span class="cu-dot"></span><div><b>${esc(i.title)}</b><small>${esc(i.why)}</small>${i.next ? `<em>${esc(i.next)}</em>` : ''}</div>${i.where ? `<button class="du-btn ghost" data-cu-to="${esc(i.where)}">Open</button>` : ''}</li>`).join('')}</ul>
      <p class="du-muted">${esc(NOT_APPROVAL)}</p></article>`;
      box.querySelectorAll('[data-cu-to]').forEach(b2 => b2.onclick = () => {
        const t = b2.dataset.cuTo;
        if (t === 'project-info') toTab(c, 'project-info', '#portal/project-info?id=' + pid);
        else if (t === 'specs') toTab(c, 'check', '#portal/check?mode=specs&project=' + pid);
        else if (t === 'documents') toTab(c, 'documents', '#portal/documents?project=' + pid);
        else if (t === 'check') toTab(c, 'check', '#portal/check?project=' + pid);
        else toTab(c, 'projects', '#portal/projects');
      });
      const rep = () => reportDoc({
        kicker: 'CheckUp · DD Readiness', title: r.title, pid: r.project_thread_id, project: (projs.find(p => p.id === r.project_thread_id) || {}).project_name || '',
        summary: r.summary || '', score: r.score, cols: ['State', 'Item', 'Where it stands', 'What is next'],
        rows: items.map(i => [i.state === 'done' ? 'In place' : i.state === 'partial' ? 'Part way' : 'Not yet', i.title, i.why, i.next]),
        how: 'DrawUp read this project\'s own records: Project Information with the source of each value, the program and its areas, the team and milestones, the recorded decisions, the drawing set, the specification documents, the finished CheckUp reviews and the documents filed under the project. Nothing was assumed about zoning, survey data or the adopted code edition.',
      });
      box.querySelector('[data-cu-pdf]').onclick = async () => { const st = box.querySelector('.cu-st2'); st.textContent = 'Building the PDF…'; try { await downloadReport(rep(), {}); st.textContent = ''; } catch (e) { st.textContent = 'Not built: ' + (e.message || e); } };
      box.querySelector('[data-cu-save]').onclick = async () => { const st = box.querySelector('.cu-st2'); st.textContent = 'Saving…'; try { const id = await saveReport(c, rep()); st.textContent = 'Saved to Documents.'; if (!missing && r.id) await c.client.from('spec_reviews').update({ report_document_id: id }).eq('id', r.id); } catch (e) { st.textContent = 'Not saved: ' + (e.message || e); } };
    };
    draw();
  }

  async function renderHistory(w, c) {
    w.innerHTML = '<div class="du-loading">LOADING REVIEW HISTORY…</div>';
    const [ck, sr, pf] = await Promise.all([
      c.client.from('check_reviews').select('id,title,mode,status,created_at,findings,file_name,project_thread_id').eq('owner_id', c.user.id).order('created_at', { ascending: false }).limit(60),
      c.client.from('spec_reviews').select('id,kind,title,score,status,created_at,findings,document_title,project_thread_id').eq('owner_id', c.user.id).order('created_at', { ascending: false }).limit(60),
      c.client.from('portfolio_reviews').select('id,title,status,created_at,feedback,file_name').eq('user_id', c.user.id).order('created_at', { ascending: false }).limit(40),
    ]);
    const projs = await projects(c); const pname = id => (projs.find(p => p.id === id) || {}).project_name || '';
    const MODE = { plans: 'Drawing Review', narrative: 'Design Narrative Review', narrative_plans: 'Narrative vs. Plans' };
    const open = f => (Array.isArray(f) ? f : []).filter(x => x.severity && x.severity !== 'info').length;
    const list = []
      .concat((ck.data || []).map(r => ({ at: r.created_at, kind: MODE[r.mode] || 'Drawing Review', title: r.title, note: [r.file_name, pname(r.project_thread_id)].filter(Boolean).join(' · '), status: r.status, open: open(r.findings), go: () => toTab(c, 'check', '#portal/check?id=' + r.id) })))
      .concat((sr.data || []).map(r => ({ at: r.created_at, kind: r.kind === 'specs' ? 'Specifications Review' : 'DD Readiness', title: r.title, note: [r.document_title, pname(r.project_thread_id)].filter(Boolean).join(' · '), status: r.status, open: open(r.findings), score: r.score, go: () => toTab(c, 'check', '#portal/check?mode=' + (r.kind === 'specs' ? 'specs' : 'dd') + '&review=' + r.id) })))
      .concat((pf.data || []).map(r => ({ at: r.created_at, kind: 'Portfolio Review', title: r.title || r.file_name || 'Portfolio', note: r.file_name || '', status: r.status, score: (r.feedback && (r.feedback.score != null ? r.feedback.score : (r.feedback.overall && r.feedback.overall.score))) ?? null, go: () => toTab(c, 'portfolio', '#portal/portfolio?id=' + r.id) })))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    w.innerHTML = head('CHECKUP · REVIEW HISTORY', 'Review history', 'Every review you have run in DrawUp, newest first: drawing reviews, narrative reviews, specification reviews, DD readiness checks and portfolio reviews.', back()) +
      `<article class="du-glass">${list.length ? `<div class="cu-hist">${list.map((r, i) => `<div class="du-row" data-cu-h="${i}" tabindex="0" role="button"><div><b>${esc(r.title)}</b><small>${esc(r.kind)}${r.note ? ' · ' + esc(r.note) : ''} · ${when(r.at)}</small></div><div>${r.score != null ? `<span class="du-status-pill" data-state="complete">${r.score} / 100</span>` : ''}${r.open ? `<span class="du-status-pill" data-state="major">${r.open} OPEN</span>` : ''}<span class="du-status-pill" data-state="${esc(r.status || 'complete')}">${esc(String(r.status || 'complete').toUpperCase())}</span></div></div>`).join('')}</div>` : '<p class="du-muted">No reviews yet. Start with Quick Check or a drawing review.</p>'}</article>`;
    w.querySelector('[data-cu-back]').onclick = () => toTab(c, 'check', '#portal/check');
    w.querySelectorAll('[data-cu-h]').forEach(el => { const r = list[+el.dataset.cuH]; el.onclick = r.go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.go(); } }; });
  }

  /* ================================================================== wiring */
  function wrap() {
    const V = window.DrawUpCheckV22; if (!V || V.__cu30) return !!V;
    V.__cu30 = true; const prev = V.route;
    V.route = async (w, c, params, ctx) => {
      const m = params.get('mode');
      try {
        if (m === 'specs') { await renderSpecs(w, c, params); return true; }
        if (m === 'dd' || m === 'dd_readiness') { await renderDD(w, c, params); return true; }
        if (m === 'history') { await renderHistory(w, c); return true; }
      } catch (e) { w.innerHTML = `<article class="du-glass"><h2>This review could not open.</h2><p class="du-muted">${esc(e.message || e)}</p><button class="du-btn ghost" data-cu-back>All checks</button></article>`; w.querySelector('[data-cu-back]').onclick = () => toTab(c, 'check', '#portal/check'); return true; }
      return prev ? prev(w, c, params, ctx) : false;
    };
    return true;
  }
  if (!wrap()) document.addEventListener('DOMContentLoaded', wrap);
  const nav = (n) => {
    const S = window.DrawUpSeason; if (!S) { if ((n || 0) < 100) setTimeout(() => nav((n || 0) + 1), 150); return; }
    S.addNav({ cat: 'check', col: 'CheckUp', item: ['Specifications Review', { tab: 'check', hash: '#portal/check?mode=specs' }, 'Omissions and conflicts in your own specifications'], after: 'Portfolio Review' });
    S.addNav({ cat: 'check', col: 'CheckUp', item: ['DD Readiness', { tab: 'check', hash: '#portal/check?mode=dd' }, 'What is settled and what is not, before DD'], after: 'Specifications Review' });
    S.addNav({ cat: 'check', col: 'Results', item: ['Review History', { tab: 'check', hash: '#portal/check?mode=history' }, 'Every review you have run'], after: 'Narrative vs. Plans' });
  };
  nav(0);
  window.DrawUpCheckUp = { reviewSpec, ddReadiness, _rules: RULES, _report: reportDoc, _asSpecDoc: asSpecDoc, open: (mode, q) => toTab(window.DrawUpPortal.ctx(), 'check', '#portal/check?mode=' + mode + (q || '')) };
})();
