// DrawUp Season 1 · AI specification drafting (preliminary and outline content).
//
// A member asks in plain words ("draft the TPO roofing section for this building"). The AI reads the project's own
// information and the manual's existing sections, then returns editable sections in the DrawUp Specs format
// (Part 1, 2 and 3, articles, paragraphs), the questions it needs answered, and the assumptions it made.
// What it may not do, enforced here after the model answers, not only asked for in the instructions:
//   - name a manufacturer, brand or product line: anything that reads like one becomes a {{Manufacturer}} blank
//   - cite a code section: code citations are removed (the AHJ and the adopted edition decide those)
//   - cite anything but a standard designation from a known standards body; every one is marked to be confirmed
//   - claim compliance, certification, a warranty length or performance it was not given: those become blanks
// Everything comes back as a draft for the member to review. Nothing is saved until the member adds it.

export const DRAFT_INSTRUCTIONS = `You are a specification writer helping an architect write PRELIMINARY and OUTLINE construction specifications during schematic design and design development preparation.

Write in CSI MasterFormat numbering (six digits, "07 54 00") and SectionFormat: Part 1 General, Part 2 Products, Part 3 Execution. For an outline specification, write Part 2 and keep Parts 1 and 3 to the few lines that matter.

Use only the PROJECT INFORMATION you are given. Do not invent project facts.

Rules you must follow:
1. Never name a manufacturer, brand, trade name or proprietary product line. Describe products generically by material, type and performance. Where the architect must pick a product, write {{Manufacturer}} or {{Basis of design product}}.
2. Where a value is a design decision you were not given (thickness, R-value, color, warranty length, fire rating, load), write a blank {{label}} or a choice [[option a|option b|option c]]. Do not guess values.
3. Do not cite building code sections, and do not say the work complies with a code. The design professional and the authority having jurisdiction decide that.
4. You may refer to industry standards by designation only (for example "ASTM D6878"), and only when you are confident the designation exists and applies. Put each one in "references" with why it applies. Never quote a standard's text.
5. Do not claim certifications, listings, sustainability ratings or test results the project did not give you.
6. Put every assumption you made in "assumptions", and every piece of missing information you need in "questions" as a short, specific question.
7. You may use these project fields as linked values: <<project_name>>, <<project_number>>, <<project_address>>, <<owner_name>>, <<architect_name>>.
8. "reply" is one or two plain sentences to the architect about what you drafted and what you need from them.

If the request is not about specifications, return no sections and say so in "reply".`;

const para = { type: 'object', additionalProperties: false, required: ['text', 'level'], properties: { text: { type: 'string' }, level: { type: 'integer' } } };
const article = { type: 'object', additionalProperties: false, required: ['title', 'paragraphs'], properties: { title: { type: 'string' }, paragraphs: { type: 'array', items: para } } };
export const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reply', 'systems', 'sections', 'questions', 'assumptions', 'references'],
  properties: {
    reply: { type: 'string' },
    systems: { type: 'array', items: { type: 'string' } },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['number', 'title', 'part1', 'part2', 'part3'], properties: { number: { type: 'string' }, title: { type: 'string' }, part1: { type: 'array', items: article }, part2: { type: 'array', items: article }, part3: { type: 'array', items: article } } } },
    questions: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    references: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['designation', 'why'], properties: { designation: { type: 'string' }, why: { type: 'string' } } } },
  },
} as const;

export const LINKED_FIELDS = ['project_name', 'project_number', 'project_address', 'owner_name', 'architect_name'];
const STANDARDS = /^(ASTM|ANSI|UL|NFPA|ASHRAE|ACI|AISC|AISI|AWS|AAMA|NFRC|SMACNA|TCNA|CSA|ISO|FM|SPRI|NRCA|AWI|BHMA|GA|SDI|NAAMM|TPI|ASME|IEEE|NEMA|AWPA|APA|ANSI\/[A-Z]+|CRRC|WDMA|IGMA|NAAMM|AAMA\/WDMA)\b[ \/\-]?[A-Z]?\d/;

export type DraftPara = { t: string; lvl: number };
export type DraftArticle = { title: string; paras: DraftPara[] };
export type DraftSection = { number: string; title: string; parts: { 1: DraftArticle[]; 2: DraftArticle[]; 3: DraftArticle[] } };
export type CleanDraft = { reply: string; systems: string[]; sections: DraftSection[]; questions: string[]; assumptions: string[]; references: { designation: string; why: string; confirm: string }[]; removed: string[] };

const cut = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** One paragraph of draft text with the rules applied. Returns the text and what was removed. */
export function scrub(text: string, removed: string[]): string {
  let t = cut(text, 1400);
  // trademark and registration marks: whatever they mark is a brand
  if (/[®™©]/.test(t)) { removed.push('a trademarked name'); t = t.replace(/\b[\w.&'-]+(?:\s+[\w.&'-]+){0,3}\s*[®™©]/g, '{{Manufacturer}}').replace(/[®™©]/g, ''); }
  // "Manufacturer: Acme" / "Basis of design: Acme Roof 2000" / "Products: ..." written out
  t = t.replace(/\b(Manufacturers?|Basis[- ]of[- ]design(?: product)?|Acceptable manufacturers?|Approved manufacturers?)\s*:\s*(?!\{\{)([^.;\n]+)/gi, (_m, k) => { removed.push('a named manufacturer'); return `${k}: {{Manufacturer}}`; });
  // "as manufactured by X", "by X Inc./LLC/Corp."
  t = t.replace(/\b(as )?(manufactured|made|supplied) by [A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3}/g, () => { removed.push('a named manufacturer'); return 'by {{Manufacturer}}'; });
  t = t.replace(/\b[A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,2},?\s+(Inc|LLC|Corp|Corporation|Co|Company|Ltd)\b\.?/g, () => { removed.push('a company name'); return '{{Manufacturer}}'; });
  // code citations: the AHJ decides those
  t = t.replace(/\b(IBC|IRC|IECC|IFC|IMC|IPC|NEC|CBC|NBC|ADA Standards?|ANSI A117\.1)\s*(Section|Sec\.|§|Chapter|Table)?\s*[\d.]+[A-Za-z]?(\.\d+)*/g, (m) => { removed.push('a code citation (' + m.trim() + ')'); return '{{applicable code requirement, confirm with the AHJ}}'; });
  t = t.replace(/\b(complies|comply|compliant|in compliance) with (the )?(building )?code\b/gi, () => { removed.push('a compliance claim'); return 'meets {{the applicable code requirements, confirmed by the design professional}}'; });
  // claims it cannot know
  t = t.replace(/\b(\d{1,2})[- ]year (manufacturer'?s? |material |system |NDL )?warranty/gi, (_m, _y, k) => { removed.push('a warranty length'); return `{{warranty period}} ${k || ''}warranty`.replace(/\s+/g, ' '); });
  t = t.replace(/\b(LEED|Energy Star|Cradle to Cradle|GREENGUARD|Declare|HPD|EPD)[- ]?(certified|listed|label(l)?ed|Gold|Platinum)\b/gi, (m) => { removed.push('a certification claim (' + m + ')'); return '{{certification, if required}}'; });
  // only the linked fields DrawUp knows
  t = t.replace(/<<([a-z_]+)>>/g, (m, k) => LINKED_FIELDS.includes(k) ? m : `{{${k.replace(/_/g, ' ')}}}`);
  return t;
}

/** The model's answer -> sections DrawUp can insert, with every rule applied. Never throws. */
export function cleanDraft(raw: any): CleanDraft {
  const removed: string[] = [];
  const arts = (list: any): DraftArticle[] => (Array.isArray(list) ? list : []).slice(0, 20).map((a: any) => ({
    title: cut(a?.title, 80).toUpperCase() || 'GENERAL',
    paras: (Array.isArray(a?.paragraphs) ? a.paragraphs : []).slice(0, 30).map((p: any) => ({ t: scrub(p?.text, removed), lvl: Math.max(0, Math.min(3, Math.round(Number(p?.level) || 0))) })).filter((p: DraftPara) => p.t),
  })).filter((a: DraftArticle) => a.paras.length);
  const sections: DraftSection[] = [];
  (Array.isArray(raw?.sections) ? raw.sections : []).slice(0, 12).forEach((s: any) => {
    const m = String(s?.number || '').replace(/[^\d]/g, '');
    if (m.length !== 6) return;
    const number = `${m.slice(0, 2)} ${m.slice(2, 4)} ${m.slice(4, 6)}`;
    const sec: DraftSection = { number, title: scrub(cut(s?.title, 100), removed).replace(/\{\{Manufacturer\}\}/g, '').trim() || 'Section', parts: { 1: arts(s?.part1), 2: arts(s?.part2), 3: arts(s?.part3) } };
    if (sec.parts[1].length || sec.parts[2].length || sec.parts[3].length) sections.push(sec);
  });
  const references = (Array.isArray(raw?.references) ? raw.references : []).slice(0, 25)
    .map((r: any) => ({ designation: cut(r?.designation, 60), why: cut(r?.why, 240), confirm: 'Confirm the designation, the current edition and that it applies to this project.' }))
    .filter((r: any) => STANDARDS.test(r.designation));
  const list = (v: any, n: number, m: number) => (Array.isArray(v) ? v : []).map((x: any) => cut(x, m)).filter(Boolean).slice(0, n);
  return { reply: cut(raw?.reply, 600), systems: list(raw?.systems, 20, 120), sections, questions: list(raw?.questions, 15, 300), assumptions: list(raw?.assumptions, 15, 300), references, removed: [...new Set(removed)] };
}

/** The text the model reads: the request, the project's own values, and what the manual already has. */
export function draftInput(o: { request: string; values?: Record<string, unknown>; existing?: { number: string; title: string }[]; outline?: boolean; focus?: { number: string; title: string; text: string } | null }) {
  const v = o.values || {};
  const facts = Object.entries(v).filter(([, x]) => x != null && String(x).trim()).slice(0, 60).map(([k, x]) => `${k}: ${cut(x, 200)}`).join('\n');
  const have = (o.existing || []).slice(0, 120).map(s => `${cut(s.number, 12)} ${cut(s.title, 80)}`).join('\n');
  return [
    `DOCUMENT: ${o.outline ? 'Outline specification (preliminary, Part 2 led)' : 'Project manual (preliminary sections)'}`,
    `PROJECT INFORMATION (as recorded by the project; values marked unverified have not been checked):\n${facts || '(none recorded)'}`,
    `SECTIONS ALREADY IN THE MANUAL:\n${have || '(none yet)'}`,
    o.focus ? `SECTION THE ARCHITECT HAS OPEN: ${o.focus.number} ${o.focus.title}\n${cut(o.focus.text, 6000)}` : '',
    `REQUEST: ${cut(o.request, 1200)}`,
  ].filter(Boolean).join('\n\n');
}
