// Season 1 Portfolio Review: the AI schema, the reviewer instructions and the cleaner for /api/portfolio.
// The model sees the rendered page pictures (and the PDF's own text layer when it has one), so the review is
// about what the pages actually look like, not only their words.

export const GOALS = ['internship', 'architecture_school', 'employment', 'graduate_school', 'general'] as const;
export type Goal = (typeof GOALS)[number];
export const DISCIPLINES = ['architecture', 'interior_design', 'landscape', 'urban_design', 'other'] as const;
export const CATEGORY_KEYS = ['presentation', 'storytelling', 'technical_drawings', 'graphics', 'descriptions', 'organization'] as const;
export const CATEGORY_LABELS: Record<string, string> = {
  presentation: 'Presentation quality', storytelling: 'Storytelling', technical_drawings: 'Technical drawing clarity',
  graphics: 'Graphics', descriptions: 'Project descriptions', organization: 'Overall organization',
};
/** Layout references the page can draw as wireframes (public/drawup-portfolio-review-s1.js has the same list). */
export const LAYOUTS = ['project_opener', 'hero_with_caption', 'drawing_led_sheet', 'process_grid', 'diptych', 'sequence_strip', 'detail_callout', 'text_and_image_columns', 'contents_index', 'resume_page'] as const;

export const GOAL_LABEL: Record<Goal, string> = {
  internship: 'an internship application', architecture_school: 'an application to architecture school (undergraduate)',
  employment: 'a job application at a firm', graduate_school: 'a graduate school application', general: 'a general critique',
};
const GOAL_CRITERIA: Record<Goal, string> = {
  internship: 'Weigh what an office can use from an intern on day one: clear plans, sections and elevations, software range shown through the work, model and drawing craft, teamwork with the member\'s role stated, and a concise sequence (about 12 to 20 pages) that a reviewer can skim in two minutes. Contact details and a resume page help.',
  architecture_school: 'Weigh curiosity, creativity, range and process: sketches, art and making, observation, and how ideas develop. Technical polish matters less than evidence of visual thinking. Professional construction documents are not expected.',
  employment: 'Weigh professional readiness: project types relevant to practice, the member\'s role on each team project, technical drawings and construction documents, built or real-client work, software, and clarity at a glance. Keep it concise and lead with the strongest relevant work.',
  graduate_school: 'Weigh design thinking and rigor: a clear position or research question, conceptual development, process, critical writing, and range. Check for page-count and format limits programs usually set, and say they must be confirmed with each school.',
  general: 'Give a balanced critique across all categories without assuming a specific audience.',
};

const str = { type: 'string' };
const int = { type: 'integer' };
const pages = { type: 'array', items: int };
const BOX = { type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'], properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } };
const KIND = { type: 'string', enum: ['factual', 'subjective'] };

export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['readable', 'summary', 'goal_fit', 'overall_score', 'categories', 'strengths', 'improvements', 'pages', 'projects_found', 'layout_references', 'limitations'],
  properties: {
    readable: { type: 'boolean' },
    summary: str,
    goal_fit: str,
    overall_score: int,
    categories: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'score', 'explanation', 'pages'], properties: {
      key: { type: 'string', enum: [...CATEGORY_KEYS] }, score: int, explanation: str, pages } } },
    strengths: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'pages'], properties: { text: str, pages } } },
    improvements: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['priority', 'kind', 'category', 'title', 'detail', 'how', 'pages'], properties: {
      priority: { type: 'string', enum: ['high', 'medium', 'low'] }, kind: KIND, category: { type: 'string', enum: [...CATEGORY_KEYS] }, title: str, detail: str, how: str, pages } } },
    pages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['page', 'role', 'project', 'notes', 'layout'], properties: {
      page: int, role: str, project: str,
      notes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'severity', 'text', 'box'], properties: {
        kind: KIND, severity: { type: 'string', enum: ['high', 'medium', 'low'] }, text: str, box: { anyOf: [BOX, { type: 'null' }] } } } },
      layout: { type: 'object', additionalProperties: false, required: ['pattern', 'why', 'slots'], properties: {
        pattern: { type: 'string', enum: [...LAYOUTS, 'keep'] }, why: str,
        slots: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['slot', 'content'], properties: { slot: str, content: str } } } } },
    } } },
    projects_found: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'pages'], properties: { title: str, pages } } },
    layout_references: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['pattern', 'why', 'pages'], properties: {
      pattern: { type: 'string', enum: [...LAYOUTS] }, why: str, pages } } },
    limitations: str,
  },
};

export function reviewInstructions(goal: Goal, discipline: string, pageNumbers: number[], total: number) {
  return `You are Arch Coach inside DrawUp, reviewing a ${discipline.replace(/_/g, ' ')} portfolio for ${GOAL_LABEL[goal]}. You see each selected page as a picture, labelled with its page number in the original PDF (pages ${pageNumbers.join(', ')} of ${total}). A text layer extracted from the PDF may follow; use it to quote captions and titles exactly.
GOAL CRITERIA: ${GOAL_CRITERIA[goal]}
Review six categories, each scored 0 to 10 with a short explanation that names the pages it is based on: presentation (layout, hierarchy, whitespace, consistency, image quality), storytelling (sequence, project openers, how each project's idea is introduced and resolved, the arc of the whole portfolio), technical_drawings (legibility at page size, line weights, scale bars, north arrows, labels, drawing types present), graphics (typography, color, diagrams, rendering and photo quality, consistency), descriptions (project text: clarity, length, specificity, role on team projects, typos), organization (order, contents, page count for the goal, contact and resume pages). overall_score is 0 to 100 and must agree with the category scores and the goal.
RULES:
1. Judge only what is on these pages. Never invent projects, clients, awards, schools, software, dates, roles or achievements. Name a project only by the title printed on its pages; if it has none, call it "the project on page N". projects_found lists only titles that are printed.
2. Label every improvement and every page note as factual or subjective. factual = checkable on the page: a typo (quote it), text too small to read at page size, a missing scale bar or north arrow on a plan, a pixelated or stretched image, a caption that does not match its image, inconsistent project titles, missing page numbers or contact details. subjective = design and presentation judgement (composition, sequence, emphasis, tone). Say "consider" for subjective points; never present taste as a rule.
3. strengths: 3 to 6 specific strengths with pages. improvements: 4 to 10, ordered by impact for this goal, each with what to change and how, and the pages.
4. pages: one entry for every selected page: role (cover, contents, project opener, drawing sheet, process, renderings, resume, other), the printed project title or "", 0 to 4 notes, each with a box (fractions 0 to 1 of the page picture from its top-left: x, y, w, h) around the area it is about, or null when it is about the whole page. layout: the layout reference that would help this page most from the list (or "keep" when the page works), why, and slots naming which of THIS page's existing content goes in each slot of that layout (for example "hero: the section perspective", "caption: project title and a 40-word idea statement"). Do not add content that is not on the page; this is a conceptual layout preview, not a redesign.
5. layout_references: 2 to 4 layouts that would help the portfolio as a whole, with the pages they apply to.
6. If the pages cannot be read (blank, corrupt, not a portfolio), set readable=false, explain in summary, and keep the rest minimal.
7. Write plainly and encouragingly, as a professional reviewer would. Admissions and hiring decisions are made by schools and firms; do not promise outcomes.
limitations: what you could not judge (for example, pages not selected, image quality of the upload, or school-specific requirements). Return JSON only, matching the schema.`;
}

export const ASK_INSTRUCTIONS = `You are Arch Coach inside DrawUp, answering a member's question about one page of their portfolio. You see the page as a picture, plus the review DrawUp already wrote for it. Answer the question directly in 2 to 6 short paragraphs or a short list. Only talk about what is on the page; never invent projects, credentials or achievements. Say whether each point is a factual issue (checkable on the page) or a subjective design suggestion. If the question is not about the portfolio, answer briefly and steer back to the page. Return JSON only: answer (markdown allowed: short paragraphs and "- " lists), and follow_ups (0 to 3 short questions the member might ask next).`;
export const ASK_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['answer', 'follow_ups'],
  properties: { answer: str, follow_ups: { type: 'array', items: str } },
};

/* ------------------------------------------------------------------ cleaning */
const S = (v: unknown, max = 1200) => String(v ?? '').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
const clampInt = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function cleanBox(b: any) {
  if (!b || ![b.x, b.y, b.w, b.h].every(n => typeof n === 'number' && isFinite(n))) return null;
  const x = Math.max(0, Math.min(0.98, b.x)), y = Math.max(0, Math.min(0.98, b.y));
  const w = Math.max(0.02, Math.min(1 - x, b.w)), h = Math.max(0.02, Math.min(1 - y, b.h));
  return { x: +x.toFixed(4), y: +y.toFixed(4), w: +w.toFixed(4), h: +h.toFixed(4) };
}

/**
 * Keeps the review honest: page numbers must be pages that were reviewed, scores stay in range, and a project
 * title is marked "printed" only when the PDF's own text contains it (titles read from a picture keep "as read").
 */
export function cleanReview(r: any, reviewed: number[], textLayer: string) {
  const ok = new Set(reviewed);
  const pg = (a: unknown) => [...new Set((Array.isArray(a) ? a : []).map(n => Math.round(Number(n))).filter(n => ok.has(n)))].slice(0, 40);
  const text = norm(textLayer || '');
  const categories = CATEGORY_KEYS.map(key => {
    const c = (Array.isArray(r?.categories) ? r.categories : []).find((x: any) => x?.key === key) || {};
    return { key, label: CATEGORY_LABELS[key], score: clampInt(c.score, 0, 10), explanation: S(c.explanation, 900), pages: pg(c.pages) };
  });
  const avg = categories.reduce((s, c) => s + c.score, 0) / categories.length;
  let overall = clampInt(r?.overall_score, 0, 100);
  // The overall score must agree with the categories (within 15 points of their average).
  if (Math.abs(overall - avg * 10) > 15) overall = Math.round(avg * 10);
  const improvements = (Array.isArray(r?.improvements) ? r.improvements : []).filter((i: any) => S(i?.title) || S(i?.detail)).slice(0, 12).map((i: any, n: number) => ({
    id: 'I' + (n + 1), priority: pick(i.priority, ['high', 'medium', 'low'] as const, 'medium'), kind: pick(i.kind, ['factual', 'subjective'] as const, 'subjective'),
    category: pick(i.category, CATEGORY_KEYS, 'presentation'), title: S(i.title, 160), detail: S(i.detail, 1200), how: S(i.how, 1200), pages: pg(i.pages),
  }));
  const rank = { high: 0, medium: 1, low: 2 } as const;
  improvements.sort((a: any, b: any) => rank[a.priority as keyof typeof rank] - rank[b.priority as keyof typeof rank]);
  improvements.forEach((i: any, n: number) => { i.id = 'I' + (n + 1); });
  const byPage = new Map<number, any>();
  for (const p of Array.isArray(r?.pages) ? r.pages : []) {
    const n = Math.round(Number(p?.page)); if (!ok.has(n) || byPage.has(n)) continue;
    const pattern = pick(p?.layout?.pattern, [...LAYOUTS, 'keep'] as const, 'keep');
    byPage.set(n, {
      page: n, role: S(p.role, 60) || 'other', project: S(p.project, 160),
      notes: (Array.isArray(p.notes) ? p.notes : []).filter((x: any) => S(x?.text)).slice(0, 5).map((x: any) => ({
        kind: pick(x.kind, ['factual', 'subjective'] as const, 'subjective'), severity: pick(x.severity, ['high', 'medium', 'low'] as const, 'medium'), text: S(x.text, 700), box: cleanBox(x.box),
      })),
      layout: { pattern, why: S(p.layout?.why, 500), slots: (Array.isArray(p.layout?.slots) ? p.layout.slots : []).filter((s: any) => S(s?.slot)).slice(0, 6).map((s: any) => ({ slot: S(s.slot, 40), content: S(s.content, 200) })) },
    });
  }
  // Every reviewed page gets an entry, so the page list never has holes.
  for (const n of reviewed) if (!byPage.has(n)) byPage.set(n, { page: n, role: 'other', project: '', notes: [], layout: { pattern: 'keep', why: '', slots: [] } });
  let noteNo = 0;
  const pageList = [...byPage.values()].sort((a, b) => a.page - b.page);
  pageList.forEach(p => p.notes.forEach((x: any) => { x.id = 'N' + ++noteNo; }));
  return {
    readable: r?.readable !== false,
    summary: S(r?.summary, 1500), goal_fit: S(r?.goal_fit, 1500), overall_score: overall, categories,
    strengths: (Array.isArray(r?.strengths) ? r.strengths : []).filter((s: any) => S(s?.text)).slice(0, 8).map((s: any) => ({ text: S(s.text, 600), pages: pg(s.pages) })),
    improvements,
    pages: pageList,
    projects_found: (Array.isArray(r?.projects_found) ? r.projects_found : []).filter((p: any) => S(p?.title)).slice(0, 20).map((p: any) => {
      const t = S(p.title, 160); return { title: t, pages: pg(p.pages), printed: !!text && text.includes(norm(t)) };
    }),
    layout_references: (Array.isArray(r?.layout_references) ? r.layout_references : []).filter((l: any) => LAYOUTS.includes(l?.pattern)).slice(0, 5).map((l: any) => ({ pattern: l.pattern, why: S(l.why, 500), pages: pg(l.pages) })),
    limitations: S(r?.limitations, 1200),
  };
}

export function cleanAnswer(r: any) {
  return { answer: S(r?.answer, 6000), follow_ups: (Array.isArray(r?.follow_ups) ? r.follow_ups : []).map((x: any) => S(x, 200)).filter(Boolean).slice(0, 3) };
}
