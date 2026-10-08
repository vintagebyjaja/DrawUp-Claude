import { NextResponse } from 'next/server';
import { streamCreate, streamRead } from '@/lib/drawup-stream';
import { awardXp } from '@/lib/drawup-coach-persona';
import { docxNumberedText } from '@/lib/drawup-docx';
import {
  PRIVATE_BUCKET, adminRest, adminSelectOne, adminUpdate, bytesToBase64, creditMessage, missingConfig, models,
  openaiCancel, openaiCreate, openaiGet, outputText, pathIsOwn, refundCredits, reserveCredits, signedInUser, sourcesFrom,
  storageDownload, type CreditAccess,
} from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DrawUp Check: a member uploads a PDF drawing set to their private folder and creates a
// check_reviews row (RLS). POST starts the review: credits are reserved, the PDF is sent
// to the AI as a background job, and the row moves to "reviewing". GET polls the job and,
// when it finishes, saves the findings to the row (or refunds and marks it failed).
// Background mode keeps every request short, so hosting function time limits don't apply.
//
// V22 adds two more modes on the same row (column `mode`, migration 0046):
//  - narrative: an AEC design narrative (PDF or Word) is reviewed first; nothing is rewritten.
//  - narrative_plans: the narrative is read against an uploaded plan set (what it should cover,
//    and what it says that the plans contradict, cited by sheet and page).
// After a narrative review the member approves changes and POST {action:'rewrite'} writes the
// revised document as structured JSON; the page turns it into DOCX and PDF.
// V22 also fixes the 95% hang: a stream that ends without a final event no longer loops forever,
// partial output is kept, and a review can never run past MAX_RUN_MS.

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_RUN_MS = 25 * 60 * 1000;
const CATEGORIES = ['code', 'accessibility', 'life_safety', 'coordination', 'dimensions', 'documentation', 'structural', 'mep', 'site'];
const LABELS = ['document_states', 'verified_requirement', 'recommendation', 'needs_confirmation'];
const BOX = {
  type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'],
  properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
};
const FIX = {
  type: 'object', additionalProperties: false, required: ['type', 'symbol', 'label', 'lines', 'box'],
  properties: {
    type: { type: 'string', enum: ['dimension', 'tag', 'note', 'code_summary', 'table', 'none'] },
    symbol: { type: 'string', enum: ['door', 'window', 'wall', 'room', 'keynote', 'none'] },
    label: { type: 'string' },
    lines: { type: 'array', items: { type: 'string' } },
    box: BOX,
  },
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'page_count', 'sheets_reviewed', 'code_basis', 'findings', 'limitations'],
  properties: {
    summary: { type: 'string' },
    page_count: { type: 'integer' },
    sheets_reviewed: { type: 'array', items: { type: 'string' } },
    code_basis: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'severity', 'sheet', 'page', 'box', 'anchors', 'location', 'issue', 'recommendation', 'fix', 'reference', 'confidence'],
        properties: {
          category: { type: 'string', enum: CATEGORIES },
          severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] },
          sheet: { type: 'string' },
          page: { type: 'integer' },
          box: BOX,
          anchors: { type: 'array', items: { type: 'string' } },
          location: { type: 'string' },
          issue: { type: 'string' },
          recommendation: { type: 'string' },
          fix: FIX,
          reference: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    limitations: { type: 'string' },
  },
};

const str = { type: 'string' };
const NARRATIVE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['document_type', 'document_purpose', 'audience', 'summary', 'facts', 'jurisdiction', 'points', 'missing', 'repetition', 'coverage', 'conflicts', 'limitations'],
  properties: {
    document_type: str, document_purpose: str, audience: str, summary: str,
    facts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'status', 'where'], properties: {
      field: str, value: str, status: { type: 'string', enum: ['document_states', 'needs_confirmation'] }, where: str } } },
    jurisdiction: { type: 'object', additionalProperties: false, required: ['city', 'county', 'state', 'ahj', 'special_authorities'], properties: {
      city: str, county: str, state: str, ahj: str, special_authorities: { type: 'array', items: str } } },
    points: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'label', 'topic', 'where', 'page', 'quote', 'comment', 'proposed_change', 'source_url', 'severity'], properties: {
        id: str, label: { type: 'string', enum: LABELS }, topic: str, where: str, page: { type: 'integer' }, quote: str, comment: str,
        proposed_change: str, source_url: str, severity: { type: 'string', enum: ['high', 'medium', 'low'] } } } },
    missing: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'item', 'why', 'label'], properties: {
      id: str, item: str, why: str, label: { type: 'string', enum: LABELS } } } },
    repetition: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['phrase', 'count', 'suggestion'], properties: {
      phrase: str, count: { type: 'integer' }, suggestion: str } } },
    coverage: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'topic', 'from_plans', 'sheet', 'page', 'status', 'narrative_where', 'proposed_text'], properties: {
        id: str, topic: str, from_plans: str, sheet: str, page: { type: 'integer' },
        status: { type: 'string', enum: ['covered', 'partial', 'missing', 'not_applicable'] }, narrative_where: str, proposed_text: str } } },
    conflicts: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['id', 'narrative_quote', 'narrative_where', 'plans_show', 'sheet', 'page', 'box', 'anchors', 'severity', 'proposed_change'], properties: {
        id: str, narrative_quote: str, narrative_where: str, plans_show: str, sheet: str, page: { type: 'integer' }, box: BOX,
        anchors: { type: 'array', items: str }, severity: { type: 'string', enum: ['critical', 'major', 'minor', 'info'] }, proposed_change: str } } },
    limitations: str,
  },
};

const REWRITE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'subtitle', 'document_type', 'project_facts', 'sections', 'needs_confirmation', 'change_log', 'limitations'],
  properties: {
    title: str, subtitle: str, document_type: str,
    project_facts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'value'], properties: { label: str, value: str } } },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'level', 'paragraphs', 'bullets'], properties: {
      heading: str, level: { type: 'integer' }, paragraphs: { type: 'array', items: str }, bullets: { type: 'array', items: str } } } },
    needs_confirmation: { type: 'array', items: str },
    change_log: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'change'], properties: { id: str, change: str } } },
    limitations: str,
  },
};

const clamp01 = (n: number) => Math.max(0, Math.min(0.98, n));

function countPdfPages(bytes: ArrayBuffer) {
  const text = Buffer.from(bytes).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?!s)/g) || []).length || null;
}

function priceFor(pages: number | null) {
  return pages && pages > 10 ? { action: 'large_document_analysis', cost: 150 } : { action: 'plan_analysis', cost: 30 };
}

const INSTRUCTIONS = `You are DrawUp Check, a plan reviewer for architecture, engineering and construction drawing sets.
Review ONLY the attached PDF. Every finding must point to something you can actually see in it: give the sheet number/title and where on the sheet.
Never invent sheets, rooms, dimensions or notes that are not in the file. If the set is too incomplete to judge an item, say so in limitations instead of guessing.
Review for: building code (use the jurisdiction and adopted code edition when given; otherwise state the model code you assumed), accessibility (2010 ADA Standards / ICC A117.1), life safety and egress, coordination between plans/sections/elevations/schedules, dimension strings that do not add up or are missing, documentation completeness (title block, scale, north arrow, sheet index, references), and obvious structural/MEP/site coordination gaps.
Cite the specific code section in "reference" only when you are confident of it; otherwise write the topic (for example "IBC egress width — verify section for adopted edition").
Severity: critical = life-safety or likely permit rejection; major = must be fixed before issue; minor = drafting/quality; info = note for the designer.
For every finding also give "page" (the 1-based page number of the PDF where it is) and "box": the region on that page as fractions of the page width and height measured from the TOP-LEFT corner (x, y, w, h each between 0 and 1). The box is used to draw a redline cloud on the sheet, so cover the whole area concerned, a little generously. For a sheet-wide issue (title block, missing note) use the area you would mark up by hand.
"sheet" is the sheet number exactly as printed in the title block (for example A101). If one issue repeats on several sheets, give the first sheet where it occurs and list the others in "location".
"anchors": up to 4 short text strings printed on that sheet right at the issue (room name, door or wall tag, grid label, keynote, note heading), copied EXACTLY as printed. DrawUp finds them in the PDF text layer to place the cloud precisely, so never paraphrase them and never list text that is not on the sheet.
Write "recommendation" as the specific change to make on the drawing (for example: Add 32 in. minimum clear width dimension at Door 101).
"fix" describes how that part of THIS sheet should look once corrected, so DrawUp can draw it on top of the original sheet in drafting style. Never redesign the building or invent a different layout. type: "dimension" (label = the dimension text, for example 3'-0" CLR MIN.), "tag" (symbol = door/window/wall/room/keynote; label = the tag text), "note" (lines = note text in drafting capitals), "code_summary" (lines = "LABEL: value" rows), "table" (lines = rows with cells separated by |), or "none". Use only values that are shown in the set or are the code minimum you cite; for anything the set does not establish write NEEDS CONFIRMATION instead of a value. "fix.box" is where to draw it on the same page (same fractions as box): an empty area next to the issue for notes and tables, the dimensioned span for dimensions.
A TEXT LAYER may follow: the text printed on each page, extracted from the PDF by DrawUp. Use it to confirm page numbers and copy anchors exactly.
This is guidance for the design team, not a permit approval. Return JSON only, matching the schema.`;

// Jaja's AEC Professional Document + Design Narrative Reviewer brief, condensed for the review pass.
const NARRATIVE_INSTRUCTIONS = `DRAWUP NARRATIVE REVIEW. You are an expert AEC document reviewer, technical editor, proposal strategist and professional document designer. Review the uploaded document (design narrative, project approach, proposal, report, study, programming or basis-of-design document). Your goal is NOT to rewrite it now: review first, recommend, and wait for the user to approve changes.
1. Read the entire document first. Understand what it is trying to accomplish and preserve accurate project information already provided.
2. "facts": list what the document states for: project name, location, city, state, jurisdiction / AHJ, owner / client, building or project type, delivery method, current phase, construction type, occupancy / use, budget, schedule, existing conditions, scope of work, design goals, consultants, team responsibilities, stakeholders, operational constraints, phasing, codes already referenced, sustainability, accessibility, security, technology, cost constraints, known risks, required deliverables. Copy values as the document states them and say where (page or [P#] paragraph). If a fact is missing or unclear, value = "NEEDS CONFIRMATION" and status = needs_confirmation. NEVER invent missing project information and never silently assume.
3. Determine the document type and purpose, and judge it by the standard for that type and audience: a design narrative should not read like marketing copy, a proposal not like a specification, a technical report not like a brochure.
4. "jurisdiction": city, county, state, authority having jurisdiction and any special authorities (airport, university, state construction office, healthcare, transit, federal, school system, port, campus facilities, historic commission, utility, fire marshal, planning). Write NEEDS CONFIRMATION for anything the document does not establish. Use web search only for official sources (jurisdiction sites, adopted code information, owner standards, state and municipal agencies) and never claim a code or requirement applies unless it can be reasonably established.
5. Every item in "points" carries exactly one label: document_states (what the uploaded document says), verified_requirement (confirmed from an authoritative source; put that source in source_url), recommendation (a professional improvement you suggest), needs_confirmation (cannot be verified now; say who should confirm: architect, engineer, code consultant, owner or AHJ). Do not perform a fake code analysis to sound technical; only add regulatory language that is relevant and supportable.
6. Apply project-type thinking (airports, healthcare, higher education, K-12, commercial / workplace and others) and review the writing for accuracy, completeness, clarity, organization, tone, technical credibility, project specificity, repetition, generic language, unsupported claims, marketing language, weak transitions, conflicting information, unclear responsibilities, vague promises and missing measurable commitments. Prefer specific actions over generic phrases ("coordinate closely", "throughout the project", "ensure", "collaborative approach", "successful project", "high-quality design"); list overused phrases in "repetition" with a count.
7. "missing": what would strengthen this document (critical success factors, project-specific challenges, milestones, responsibility matrix, stakeholder engagement, decision log, risk register, scope-to-budget tracking, cost reconciliation, value engineering, constructability, procurement, long-lead items, phasing, logistics, temporary operations, user experience, accessibility, QA/QC, schedule controls, RFI and submittal management, commissioning) when relevant to this project.
For each point give "where" (page number for a PDF or [P#] paragraph for Word), the exact "quote" when it refers to existing text, "comment", and "proposed_change" (the replacement or addition, using only facts from the document or NEEDS CONFIRMATION placeholders). Use ids R1, R2... for points and M1, M2... for missing items.
When a PLAN SET is attached (narrative vs. plans): read the plans too. "coverage" lists what the narrative should cover because the plans show it (for example: number of levels, new vs. existing work, demolition, egress stairs, elevators, accessible rooms or units, fire protection, phasing, major spaces), each with the sheet and 1-based PDF page where the plans show it, whether the narrative covers it, and proposed_text for gaps (ids V1, V2...). "conflicts" lists narrative statements that do not match what the plans show: quote the narrative, say what the plans show, cite sheet and page, give the region on that plan page as box fractions from the top-left, anchors copied exactly from the plan text layer, and the proposed correction (ids C1, C2...). Without plans, return empty coverage and conflicts.
A TEXT LAYER may follow for PDFs, extracted by DrawUp; use it to cite pages and copy quotes and anchors exactly. Return JSON only, matching the schema.`;

const REWRITE_INSTRUCTIONS = `DRAWUP NARRATIVE REWRITE. You are an expert AEC technical editor and professional document designer. Rewrite the attached document into a polished, professionally organized version of the SAME document for the SAME project, applying ONLY the changes the user approved (listed below with their ids) plus clean-up of grammar, flow and organization.
Rules: preserve every accurate project fact from the original (names, location, owner, scope, dates, numbers, team). NEVER invent project information: where an approved change needs a fact the document does not give, write NEEDS CONFIRMATION in its place and list it in "needs_confirmation". Keep the document type and audience (a design narrative reads as a technical narrative, not marketing). Replace generic phrases with specific actions only where the document or the approved changes support them. Do not add code requirements that were not approved or are not in the original.
Never change project names, firm names, consultant names, budget, schedule, scope, location, technical requirements or project delivery method unless the source supports it or the change was approved. Write so it sounds professional and human: project-specific, no AI-sounding filler, no needless repetition, active voice where appropriate, clear team responsibilities, measurable commitments where possible, and no promises the team cannot reasonably guarantee. Keep terminology consistent. Use tables (critical success factors, milestones, risk register, responsibility matrix, phasing) only where they make information easier to understand, not as decoration. Keep internal editing notes out of the client-facing sections; they belong in change_log.
Return: title and subtitle for the cover, document_type, project_facts (label/value rows for a project information table, values as the document states them or NEEDS CONFIRMATION), sections in reading order (heading, level 1 or 2, paragraphs, bullets), needs_confirmation, change_log (one entry per approved id saying what changed; ids not applied say why), limitations. Return JSON only, matching the schema.`;

async function loadOwned(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await adminSelectOne<any>('check_reviews', `id=eq.${id}&select=*`);
  return row && row.owner_id === userId ? row : null;
}

/* ---------------------------------------------------------------- partial output (V22) */
/** Complete objects already written inside the JSON array `key`, even when the text is cut off. */
function arrayObjects(text: string, key: string): any[] {
  const k = text.indexOf('"' + key + '"');
  if (k < 0) return [];
  let i = text.indexOf('[', k);
  if (i < 0) return [];
  const out: any[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (i = i + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') { depth--; if (depth === 0 && start >= 0) { try { out.push(JSON.parse(text.slice(start, i + 1))); } catch {} start = -1; } }
    else if (ch === ']' && depth === 0) break;
  }
  return out;
}
function stringField(text: string, key: string) {
  const m = text.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  try { return m ? JSON.parse('"' + m[1] + '"') : ''; } catch { return ''; }
}
/** Parses the model's JSON; when it was cut off, keeps every complete item that arrived. */
function parseReport(text: string, arrays: string[], strings: string[]): { report: any; partial: boolean } | null {
  try { const r = JSON.parse(text); if (r && typeof r === 'object') return { report: r, partial: false }; } catch {}
  if (!text || !text.trim().startsWith('{')) return null;
  const r: any = {};
  arrays.forEach(k => { r[k] = arrayObjects(text, k); });
  strings.forEach(k => { r[k] = stringField(text, k); });
  return { report: r, partial: true };
}

/* ---------------------------------------------------------------- normalizers */
const goodBox = (b: any) => b && [b.x, b.y, b.w, b.h].every((n: any) => typeof n === 'number' && isFinite(n)) && b.w > 0 && b.h > 0
  ? { x: clamp01(b.x), y: clamp01(b.y), w: Math.max(0.02, Math.min(1, b.w)), h: Math.max(0.02, Math.min(1, b.h)) } : null;
const strs = (a: any, n = 8) => (Array.isArray(a) ? a : []).filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().slice(0, 240)).slice(0, n);
function normFix(x: any) {
  if (!x || typeof x !== 'object') return null;
  const type = ['dimension', 'tag', 'note', 'code_summary', 'table'].includes(x.type) ? x.type : null;
  if (!type) return null;
  return { type, symbol: ['door', 'window', 'wall', 'room', 'keynote'].includes(x.symbol) ? x.symbol : 'none', label: String(x.label || '').slice(0, 120), lines: strs(x.lines, 14), box: goodBox(x.box) };
}
function normFindings(list: any): any[] {
  return (Array.isArray(list) ? list : [])
    .filter((f: any) => f && typeof f.issue === 'string' && f.issue.trim())
    .map((f: any) => ({
      category: CATEGORIES.includes(f.category) ? f.category : 'documentation',
      severity: ['critical', 'major', 'minor', 'info'].includes(f.severity) ? f.severity : 'info',
      sheet: String(f.sheet || ''), location: String(f.location || ''), issue: String(f.issue),
      page: Number.isInteger(f.page) && f.page > 0 ? f.page : null,
      box: goodBox(f.box),
      anchors: strs(f.anchors, 4),
      recommendation: String(f.recommendation || ''), reference: String(f.reference || ''),
      fix: normFix(f.fix),
      confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium',
    }));
}
const lab = (s: any) => (LABELS.includes(s) ? s : 'needs_confirmation');
function normNarrative(r: any) {
  const S = (v: any) => String(v ?? '').trim();
  const nc = (v: any) => S(v) || 'NEEDS CONFIRMATION';
  const j = r?.jurisdiction || {};
  return {
    document_type: nc(r?.document_type), document_purpose: S(r?.document_purpose), audience: S(r?.audience), summary: S(r?.summary),
    facts: (Array.isArray(r?.facts) ? r.facts : []).filter((f: any) => f && S(f.field)).map((f: any) => {
      const value = nc(f.value); return { field: S(f.field), value, status: /NEEDS CONFIRMATION/i.test(value) ? 'needs_confirmation' : (f.status === 'needs_confirmation' ? 'needs_confirmation' : 'document_states'), where: S(f.where) };
    }),
    jurisdiction: { city: nc(j.city), county: nc(j.county), state: nc(j.state), ahj: nc(j.ahj), special_authorities: strs(j.special_authorities, 12) },
    points: (Array.isArray(r?.points) ? r.points : []).filter((p: any) => p && S(p.comment)).map((p: any, i: number) => ({
      id: S(p.id) || 'R' + (i + 1), label: lab(p.label), topic: S(p.topic), where: S(p.where), page: Number.isInteger(p.page) && p.page > 0 ? p.page : null,
      quote: S(p.quote), comment: S(p.comment), proposed_change: S(p.proposed_change),
      source_url: /^https?:\/\//i.test(S(p.source_url)) ? S(p.source_url) : '', severity: ['high', 'medium', 'low'].includes(p.severity) ? p.severity : 'medium',
    })).map((p: any) => (p.label === 'verified_requirement' && !p.source_url ? { ...p, label: 'needs_confirmation' } : p)),
    missing: (Array.isArray(r?.missing) ? r.missing : []).filter((m: any) => m && S(m.item)).map((m: any, i: number) => ({ id: S(m.id) || 'M' + (i + 1), item: S(m.item), why: S(m.why), label: lab(m.label) })),
    repetition: (Array.isArray(r?.repetition) ? r.repetition : []).filter((x: any) => x && S(x.phrase)).map((x: any) => ({ phrase: S(x.phrase), count: Number(x.count) || 0, suggestion: S(x.suggestion) })),
    coverage: (Array.isArray(r?.coverage) ? r.coverage : []).filter((c: any) => c && S(c.topic)).map((c: any, i: number) => ({
      id: S(c.id) || 'V' + (i + 1), topic: S(c.topic), from_plans: S(c.from_plans), sheet: S(c.sheet), page: Number.isInteger(c.page) && c.page > 0 ? c.page : null,
      status: ['covered', 'partial', 'missing', 'not_applicable'].includes(c.status) ? c.status : 'partial', narrative_where: S(c.narrative_where), proposed_text: S(c.proposed_text),
    })),
    conflicts: (Array.isArray(r?.conflicts) ? r.conflicts : []).filter((c: any) => c && S(c.plans_show)).map((c: any, i: number) => ({
      id: S(c.id) || 'C' + (i + 1), narrative_quote: S(c.narrative_quote), narrative_where: S(c.narrative_where), plans_show: S(c.plans_show), sheet: S(c.sheet),
      page: Number.isInteger(c.page) && c.page > 0 ? c.page : null, box: goodBox(c.box), anchors: strs(c.anchors, 4),
      severity: ['critical', 'major', 'minor', 'info'].includes(c.severity) ? c.severity : 'major', proposed_change: S(c.proposed_change),
    })),
    limitations: S(r?.limitations),
  };
}
function normRewrite(r: any) {
  const S = (v: any) => String(v ?? '').trim();
  return {
    title: S(r?.title) || 'Revised document', subtitle: S(r?.subtitle), document_type: S(r?.document_type),
    project_facts: (Array.isArray(r?.project_facts) ? r.project_facts : []).filter((f: any) => f && S(f.label)).map((f: any) => ({ label: S(f.label), value: S(f.value) || 'NEEDS CONFIRMATION' })),
    sections: (Array.isArray(r?.sections) ? r.sections : []).filter((s: any) => s && S(s.heading)).map((s: any) => ({
      heading: S(s.heading), level: s.level === 2 ? 2 : 1, paragraphs: (Array.isArray(s.paragraphs) ? s.paragraphs : []).map(S).filter(Boolean), bullets: (Array.isArray(s.bullets) ? s.bullets : []).map(S).filter(Boolean),
    })),
    needs_confirmation: (Array.isArray(r?.needs_confirmation) ? r.needs_confirmation : []).map(S).filter(Boolean),
    change_log: (Array.isArray(r?.change_log) ? r.change_log : []).filter((c: any) => c && S(c.change)).map((c: any) => ({ id: S(c.id), change: S(c.change) })),
    limitations: S(r?.limitations),
    cover: normCover(r?.cover),
  };
}
/** Optional cover sheet the member fills in before export (V22 editable rewrite). */
function normCover(c: any) {
  if (!c || typeof c !== 'object') return null;
  const S = (v: any) => String(v ?? '').trim().slice(0, 300);
  return { enabled: !!c.enabled, prepared_for: S(c.prepared_for), prepared_by: S(c.prepared_by), date: S(c.date), project_number: S(c.project_number), phase: S(c.phase), notes: S(c.notes) };
}

/** Saves the member's edits to the rewritten document (sections, facts, cover sheet). No AI, no credits. */
async function saveRewrite(review: any, body: any) {
  if (review.rewrite_status !== 'complete') return NextResponse.json({ error: 'There is no finished rewrite to save yet.' }, { status: 400 });
  const rw = normRewrite(body?.rewrite);
  if (!rw.sections.length) return NextResponse.json({ error: 'Keep at least one section with a heading.' }, { status: 400 });
  if (JSON.stringify(rw).length > 400000) return NextResponse.json({ error: 'The document is too large to save.' }, { status: 400 });
  const r = await adminUpdate('check_reviews', review.id, { rewrite: { ...rw, edited_at: new Date().toISOString() } }, 'rewrite_status=eq.complete');
  return NextResponse.json({ review: r });
}

/* ---------------------------------------------------------------- inputs */
/** Page text the browser extracted with pdf.js, as a compact block for the model. */
function textLayer(raw: any, label: string, maxChars = 50000) {
  if (!Array.isArray(raw) || !raw.length) return '';
  let s = `${label} (text printed on each page, extracted from the PDF by DrawUp):\n`;
  for (const p of raw.slice(0, 400)) {
    const n = Number(p?.page), t = String(p?.text || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    if (!(n > 0) || !t) continue;
    if (s.length + t.length > maxChars) { s += '[text layer truncated]\n'; break; }
    s += `--- PAGE ${n} ---\n${t}\n`;
  }
  return s;
}
type Doc = { kind: 'pdf' | 'docx'; bytes: ArrayBuffer; pages: number | null };
async function readDoc(path: string): Promise<Doc> {
  const file = await storageDownload(PRIVATE_BUCKET, path);
  if (file.bytes.byteLength > MAX_BYTES) throw new Error('That file is larger than 32 MB. Split it and check it in parts.');
  const head = Buffer.from(file.bytes.slice(0, 5)).toString('latin1');
  if (head === '%PDF-') return { kind: 'pdf', bytes: file.bytes, pages: countPdfPages(file.bytes) };
  if (head.startsWith('PK')) return { kind: 'docx', bytes: file.bytes, pages: null };
  throw new Error('The uploaded file is not a PDF or Word (.docx) document.');
}
function docParts(doc: Doc, name: string, label: string, layer: string) {
  if (doc.kind === 'pdf') return [{ type: 'input_file', filename: name || 'document.pdf', file_data: 'data:application/pdf;base64,' + bytesToBase64(doc.bytes) }, ...(layer ? [{ type: 'input_text', text: layer }] : [])];
  const t = docxNumberedText(doc.bytes);
  return [{ type: 'input_text', text: `${label} (Word document ${name || ''}, ${t.paragraphs} paragraphs, cite them as [P#])${t.truncated ? ' [truncated]' : ''}:\n${t.text}` }];
}
async function startJob(payload: Record<string, unknown>) {
  const list = models(process.env.DRAWUP_CHECK_MODEL, process.env.DRAWUP_COACH_MODEL);
  return streamCreate(payload, list).then(d => ({ data: d as any, model: d.model }))
    .catch(() => openaiCreate({ ...payload, background: true, store: true }, list));
}

/* ---------------------------------------------------------------- POST */
export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use DrawUp Check.' }, { status: 401 });
  const notReady = missingConfig();
  if (notReady) return NextResponse.json({ error: 'DrawUp Check is not connected yet: ' + notReady }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const review = await loadOwned(String(body?.review_id || ''), user.id);
  if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  if (body?.action === 'rewrite') return startRewrite(user, review, body);
  if (body?.action === 'save_rewrite') return saveRewrite(review, body);
  if (review.status !== 'queued') return NextResponse.json({ review });
  if (!pathIsOwn(review.file_path, user.id) || (review.plans_path && !pathIsOwn(review.plans_path, user.id))) return NextResponse.json({ error: 'That file is not yours.' }, { status: 403 });
  const mode = ['narrative', 'narrative_plans'].includes(review.mode) ? review.mode : 'plans';

  let doc: Doc, plans: Doc | null = null;
  try {
    doc = await readDoc(review.file_path);
    if (mode === 'plans' && doc.kind !== 'pdf') throw new Error('The uploaded file is not a PDF.');
    if (mode === 'narrative_plans') {
      if (!review.plans_path) throw new Error('Add the plan set PDF to compare the narrative with.');
      plans = await readDoc(review.plans_path);
      if (plans.kind !== 'pdf') throw new Error('The plan set must be a PDF.');
    }
  } catch (e: any) {
    await adminUpdate('check_reviews', review.id, { status: 'failed', error: e.message, completed_at: new Date().toISOString() });
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const pages = mode === 'narrative_plans' ? plans!.pages : doc.pages;
  const { action, cost } = priceFor(Math.max(pages || 0, mode === 'narrative_plans' ? (doc.pages || 0) : 0) || null);
  // Claim the row first so a double click can never start (or charge) two reviews.
  const claimed = await adminUpdate('check_reviews', review.id, { status: 'reviewing', started_at: new Date().toISOString() }, 'status=eq.queued');
  if (!claimed) return NextResponse.json({ review: await loadOwned(review.id, user.id) });
  const access: CreditAccess = await reserveCredits(user, cost, 'check_' + action);
  if (!access.ok) {
    await adminUpdate('check_reviews', review.id, { status: 'queued', started_at: null });
    return NextResponse.json({ error: creditMessage(access, cost), ...access }, { status: 402 });
  }

  const context = [
    `Project title: ${review.title || 'not given'}`,
    `Jurisdiction: ${review.jurisdiction || 'not given — state the model code you assumed'}`,
    `Building / occupancy type: ${review.building_type || 'not given'}`,
    ...(mode === 'plans' ? [`Review focus: ${(review.focus || CATEGORIES).join(', ')}`] : [`Review mode: ${mode === 'narrative_plans' ? 'narrative vs. plans' : 'design narrative review'}`]),
  ].join('\n');

  try {
    // V21: streamed so the page can list findings as they are written; plain background job as fallback.
    let payload: Record<string, unknown>;
    if (mode === 'plans') {
      payload = {
        instructions: INSTRUCTIONS,
        input: [{ role: 'user', content: [...docParts(doc, review.file_name, 'DRAWING SET', textLayer(body?.page_text, 'TEXT LAYER')), { type: 'input_text', text: context }] }],
        tools: review.jurisdiction ? [{ type: 'web_search' }] : [],
        text: { format: { type: 'json_schema', name: 'drawup_check_report', strict: true, schema: SCHEMA } },
      };
    } else {
      const content: any[] = [{ type: 'input_text', text: 'NARRATIVE DOCUMENT follows.' }, ...docParts(doc, review.file_name, 'NARRATIVE DOCUMENT', textLayer(body?.page_text, 'NARRATIVE TEXT LAYER', 40000))];
      if (plans) content.push({ type: 'input_text', text: 'PLAN SET follows (compare the narrative with it).' }, ...docParts(plans, review.plans_name || 'plans.pdf', 'PLAN SET', textLayer(body?.plans_text, 'PLANS TEXT LAYER', 40000)));
      content.push({ type: 'input_text', text: context });
      payload = {
        instructions: NARRATIVE_INSTRUCTIONS,
        input: [{ role: 'user', content }],
        tools: review.jurisdiction ? [{ type: 'web_search' }] : [],
        text: { format: { type: 'json_schema', name: 'drawup_narrative_review', strict: true, schema: NARRATIVE_SCHEMA } },
      };
    }
    const { data, model } = await startJob(payload);
    const updated = await adminUpdate('check_reviews', review.id, {
      response_id: data.id, model, page_count: pages, credits_charged: access.credits_charged ?? 0,
      credit_access: access, error: null, notice: null, report: {},
    });
    await awardXp(user.id, 'upload', review.id);
    return NextResponse.json({ review: updated, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
  } catch (e: any) {
    await refundCredits(user.id, access, 'check_' + action);
    await adminUpdate('check_reviews', review.id, { status: 'failed', error: (e.message || 'Review could not start.') + ' You were not charged.', completed_at: new Date().toISOString() });
    return NextResponse.json({ error: (e.message || 'Review could not start.') + ' You were not charged.' }, { status: 502 });
  }
}

/** Starts the approved rewrite of a narrative review. Approval ids come from the review itself. */
async function startRewrite(user: any, review: any, body: any) {
  if (review.mode === 'plans' || review.status !== 'complete') return NextResponse.json({ error: 'Only a finished narrative review can be rewritten.' }, { status: 400 });
  if (review.rewrite_status === 'writing') return NextResponse.json({ review });
  const rep = review.report || {};
  const pool: any[] = [
    ...(rep.points || []).map((p: any) => ({ id: p.id, kind: 'review point', label: p.label, where: p.where, quote: p.quote, change: p.proposed_change || p.comment })),
    ...(rep.missing || []).map((m: any) => ({ id: m.id, kind: 'missing content', change: m.item + (m.why ? ' — ' + m.why : '') })),
    ...(rep.coverage || []).filter((c: any) => c.status === 'missing' || c.status === 'partial').map((c: any) => ({ id: c.id, kind: 'plans coverage', where: `${c.sheet} page ${c.page ?? '?'}`, change: c.proposed_text || c.topic })),
    ...(rep.conflicts || []).map((c: any) => ({ id: c.id, kind: 'conflict with plans', where: `${c.sheet} page ${c.page ?? '?'}`, quote: c.narrative_quote, change: c.proposed_change || c.plans_show })),
  ];
  const ids = new Set((Array.isArray(body?.approved) ? body.approved : []).map(String));
  const approved = pool.filter(p => ids.has(String(p.id)));
  if (!approved.length) return NextResponse.json({ error: 'Approve at least one change before rewriting.' }, { status: 400 });
  const notes = String(body?.notes || '').slice(0, 2000);

  const claimed = await adminUpdate('check_reviews', review.id, { rewrite_status: 'writing', rewrite_error: null }, 'rewrite_status=in.(none,failed,complete)');
  if (!claimed) return NextResponse.json({ review: await loadOwned(review.id, user.id) });
  const cost = 30;
  const access: CreditAccess = await reserveCredits(user, cost, 'check_narrative_rewrite');
  if (!access.ok) {
    await adminUpdate('check_reviews', review.id, { rewrite_status: review.rewrite_status || 'none' });
    return NextResponse.json({ error: creditMessage(access, cost), ...access }, { status: 402 });
  }
  try {
    const doc = await readDoc(review.file_path);
    const facts = { document_type: rep.document_type, facts: rep.facts, jurisdiction: rep.jurisdiction };
    const payload = {
      instructions: REWRITE_INSTRUCTIONS,
      input: [{ role: 'user', content: [
        ...docParts(doc, review.file_name, 'ORIGINAL DOCUMENT', ''),
        { type: 'input_text', text: 'PROJECT FACTS FOUND IN THE REVIEW (keep these exactly):\n' + JSON.stringify(facts) },
        { type: 'input_text', text: 'APPROVED CHANGES (apply only these):\n' + JSON.stringify(approved) },
        { type: 'input_text', text: 'USER NOTES: ' + (notes || 'none') + '\nTemplate: DrawUp general professional template.' },
      ] }],
      text: { format: { type: 'json_schema', name: 'drawup_narrative_rewrite', strict: true, schema: REWRITE_SCHEMA } },
    };
    const { data } = await startJob(payload);
    const updated = await adminUpdate('check_reviews', review.id, {
      rewrite_response_id: data.id, approved: { ids: approved.map(a => a.id), notes, credit_access: access, credits_charged: access.credits_charged ?? 0, at: new Date().toISOString() },
    });
    return NextResponse.json({ review: updated, credits_charged: access.credits_charged ?? 0 });
  } catch (e: any) {
    await refundCredits(user.id, access, 'check_narrative_rewrite');
    await adminUpdate('check_reviews', review.id, { rewrite_status: 'failed', rewrite_error: (e.message || 'The rewrite could not start.') + ' You were not charged.' });
    return NextResponse.json({ error: (e.message || 'The rewrite could not start.') + ' You were not charged.' }, { status: 502 });
  }
}

/* ---------------------------------------------------------------- polling */
type JobRead = { pending: true; delta: string; cursor: number | null; activity: string | null } | { pending: false; data: any };
/**
 * Reads a background job. With `after` it returns the streamed text since that cursor.
 * V22 fix for the 95% hang: when the stream has nothing new, or ends without a final event,
 * the job itself is asked for its status instead of handing back an empty delta forever.
 */
async function readJob(id: string, after: string | null): Promise<JobRead> {
  if (after !== null) {
    const a = Number(after) || 0;
    const sr = await streamRead(id, a, 7000).catch(() => null);
    if (sr && !sr.final && !sr.failed && (sr.cursor > a || sr.text)) return { pending: true, delta: sr.text, cursor: sr.cursor, activity: sr.activity || null };
    if (sr?.final?.status === 'completed' && Array.isArray(sr.final.output) && sr.final.output.length) return { pending: false, data: sr.final };
    const data = await openaiGet(id);
    if (data.status === 'queued' || data.status === 'in_progress') return { pending: true, delta: sr?.text || '', cursor: sr ? sr.cursor : null, activity: sr?.activity || null };
    return { pending: false, data };
  }
  const data = await openaiGet(id);
  if (data.status === 'queued' || data.status === 'in_progress') return { pending: true, delta: '', cursor: null, activity: null };
  return { pending: false, data };
}
/** Everything the job has written so far (for a review that ran past the time limit). */
async function textSoFar(id: string) {
  let cursor = 0, text = '';
  for (let i = 0; i < 6; i++) {
    const sr = await streamRead(id, cursor, 4000).catch(() => null);
    if (!sr) break;
    text += sr.text;
    if (sr.final) { const t = outputText(sr.final); if (t) return t; }
    if (sr.cursor <= cursor || sr.failed) break;
    cursor = sr.cursor;
  }
  return text;
}
async function notify(userId: string, review: any, title: string, body: string) {
  await adminRest('drawup_notifications', { method: 'POST', body: JSON.stringify({ user_id: userId, kind: 'check', title, body, href: '#portal/check?id=' + review.id, ref_id: review.id }) }).catch(() => {});
}

/** Saves a finished (or stopped) review job. Returns the updated row, or null if another request did. */
async function finishReview(userId: string, review: any, data: any, stopped = '') {
  const narrative = review.mode === 'narrative' || review.mode === 'narrative_plans';
  const fail = async (message: string) => {
    const r = await adminUpdate('check_reviews', review.id, { status: 'failed', error: message + ' Your credits were refunded.', completed_at: new Date().toISOString() }, 'status=eq.reviewing');
    if (r) await refundCredits(userId, review.credit_access, 'check_refund');
    return r;
  };
  const text = stopped ? (data?.text || '') : outputText(data);
  const finishedOk = !stopped && data?.status === 'completed';
  if (!finishedOk && !text) return fail(stopped || data?.error?.message || `The review ${data?.status || 'failed'}.`);
  const parsed = narrative
    ? parseReport(text, ['facts', 'points', 'missing', 'repetition', 'coverage', 'conflicts'], ['document_type', 'document_purpose', 'audience', 'summary', 'limitations'])
    : parseReport(text, ['findings'], ['summary', 'code_basis', 'limitations']);
  if (!parsed) return fail(finishedOk ? 'The review came back unreadable.' : (stopped || `The review ${data?.status || 'failed'}.`));
  const partial = parsed.partial || !finishedOk;
  const report = parsed.report;
  let fields: Record<string, unknown>;
  let items = 0;
  if (narrative) {
    const n = normNarrative(report);
    items = n.points.length + n.conflicts.length + n.coverage.length + n.facts.length;
    // Conflicts become located findings on the plan set, so the viewer and marked-up PDF can cloud them.
    const findings = n.conflicts.map((c: any) => ({ category: 'coordination', severity: c.severity, sheet: c.sheet, page: c.page, box: c.box, anchors: c.anchors, location: c.narrative_where ? 'Narrative ' + c.narrative_where : '',
      issue: `Narrative says: "${c.narrative_quote}". Plans show: ${c.plans_show}`, recommendation: c.proposed_change, reference: c.id, fix: null, confidence: 'medium' }));
    fields = { report: n, findings, summary: [n.summary, n.limitations ? `Limits of this review: ${n.limitations}` : ''].filter(Boolean).join('\n\n') };
  } else {
    const findings = normFindings(report?.findings);
    items = findings.length;
    fields = {
      findings,
      summary: [String(report?.summary || ''), report?.code_basis ? `Code basis: ${report.code_basis}` : '', report?.limitations ? `Limits of this review: ${report.limitations}` : ''].filter(Boolean).join('\n\n'),
      page_count: Number.isInteger(report?.page_count) && report.page_count > 0 ? report.page_count : review.page_count,
    };
  }
  if (partial && !items) return fail(stopped || 'The review stopped before writing any findings.');
  const why = stopped || (data?.status === 'incomplete' ? 'the AI reached its output limit' : data?.status && data.status !== 'completed' ? 'the AI job ' + data.status : 'the answer was cut off');
  const r = await adminUpdate('check_reviews', review.id, {
    status: 'complete', ...fields,
    sources: data && !stopped ? sourcesFrom(data) : [],
    notice: partial ? `This review stopped early (${why}). It shows the ${items} item${items === 1 ? '' : 's'} written before it stopped; the document may have more. You were not charged for it.` : null,
    completed_at: new Date().toISOString(),
  }, 'status=eq.reviewing');
  if (r && partial) await refundCredits(userId, review.credit_access, 'check_partial_refund');
  if (r) await awardXp(userId, 'check', review.id);
  return r;
}
async function finishRewrite(userId: string, review: any, data: any) {
  const access = review.approved?.credit_access;
  const fail = async (message: string) => {
    const r = await adminUpdate('check_reviews', review.id, { rewrite_status: 'failed', rewrite_error: message + ' Your credits were refunded.' }, 'rewrite_status=eq.writing');
    if (r) await refundCredits(userId, access, 'check_rewrite_refund');
    return r;
  };
  const text = outputText(data);
  if (data?.status !== 'completed' && !text) return fail(data?.error?.message || `The rewrite ${data?.status || 'failed'}.`);
  const parsed = parseReport(text, ['project_facts', 'sections', 'change_log'], ['title', 'subtitle', 'document_type', 'limitations']);
  if (!parsed) return fail('The rewrite came back unreadable.');
  const rw = normRewrite(parsed.report);
  if (!rw.sections.length) return fail('The rewrite stopped before writing any sections.');
  if (parsed.partial || data?.status !== 'completed') rw.limitations = ['The rewrite stopped early; later sections may be missing. Run it again for the full document.', rw.limitations].filter(Boolean).join(' ');
  return adminUpdate('check_reviews', review.id, { rewrite_status: 'complete', rewrite: rw, rewrite_error: null }, 'rewrite_status=eq.writing');
}

/** Checks one review (and its rewrite) without streaming. Used when the member comes back. */
async function reconcileRow(userId: string, row: any) {
  let done = false;
  try {
    if (row.status === 'reviewing' && row.response_id) {
      const j = await readJob(row.response_id, null);
      const old = Date.now() - new Date(row.started_at || row.created_at).getTime() > MAX_RUN_MS;
      let r: any = null;
      if (!j.pending) r = await finishReview(userId, row, j.data);
      else if (old) { const text = await textSoFar(row.response_id); await openaiCancel(row.response_id); r = await finishReview(userId, row, { text }, 'it ran longer than 25 minutes'); }
      if (r) { done = true; await notify(userId, r, r.status === 'complete' ? 'Your DrawUp Check review is ready' : 'Your DrawUp Check review did not finish', `${r.title}: ${r.status === 'complete' ? (r.notice ? 'partial results are saved.' : 'the full report is saved.') : (r.error || 'it stopped.')}`); }
    }
    if (row.rewrite_status === 'writing' && row.rewrite_response_id) {
      const j = await readJob(row.rewrite_response_id, null);
      if (!j.pending) { const r = await finishRewrite(userId, row, j.data); if (r) { done = true; await notify(userId, r, r.rewrite_status === 'complete' ? 'Your rewritten narrative is ready' : 'The narrative rewrite did not finish', r.title); } }
    }
  } catch {}
  return done;
}

export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to use DrawUp Check.' }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get('reconcile')) {
    const r = await adminRest(`check_reviews?owner_id=eq.${user.id}&or=(status.eq.reviewing,rewrite_status.eq.writing)&select=*&order=created_at.desc&limit=10`);
    const rows = r.ok ? await r.json() : [];
    let finished = 0;
    for (const row of rows) if (await reconcileRow(user.id, row)) finished++;
    return NextResponse.json({ ok: true, checked: rows.length, finished });
  }
  const id = url.searchParams.get('id') || '';
  const review = await loadOwned(id, user.id);
  if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  const after = url.searchParams.get('after');
  const phase = url.searchParams.get('phase');

  if (phase === 'rewrite') {
    if (review.rewrite_status !== 'writing' || !review.rewrite_response_id) return NextResponse.json({ review });
    let j: JobRead;
    try { j = await readJob(review.rewrite_response_id, after); } catch (e: any) { return NextResponse.json({ review, warning: e.message }); }
    if (j.pending) return NextResponse.json({ review, delta: j.delta, cursor: j.cursor, activity: j.activity });
    const r = await finishRewrite(user.id, review, j.data);
    return NextResponse.json({ review: r || await loadOwned(review.id, user.id) });
  }

  if (review.status !== 'reviewing' || !review.response_id) return NextResponse.json({ review });
  let j: JobRead;
  try { j = await readJob(review.response_id, after); }
  catch (e: any) { return NextResponse.json({ review, warning: e.message }); }
  if (j.pending) {
    // Never let a review run forever: past the limit, keep what was written and stop the job.
    if (Date.now() - new Date(review.started_at || review.created_at).getTime() > MAX_RUN_MS) {
      const text = await textSoFar(review.response_id);
      await openaiCancel(review.response_id);
      const r = await finishReview(user.id, review, { text }, 'it ran longer than 25 minutes');
      return NextResponse.json({ review: r || await loadOwned(review.id, user.id) });
    }
    return j.cursor === null ? NextResponse.json({ review }) : NextResponse.json({ review, delta: j.delta, cursor: j.cursor, activity: j.activity });
  }
  const r = await finishReview(user.id, review, j.data);
  return NextResponse.json({ review: r || await loadOwned(review.id, user.id) });
}
