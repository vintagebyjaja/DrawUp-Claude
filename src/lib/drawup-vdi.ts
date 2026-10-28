// DrawUp v27 Visual Detail Intelligence 1.0: Find the Flaws -> Understand the Fix -> DrawUp Ready, for one drawing.
// Three AI jobs, all OpenAI background responses (the Cloudflare CPU pattern from v25.1), run by /api/vdi:
//   1. review    (vision): assessment, what looks right, findings with markers, components, model-code topics, one question
//   2. research  (web search, only official sources): the adopted code edition for the jurisdiction, each code item checked
//                against an official page, and manufacturer references from APPROVED manufacturer libraries (metadata + link)
//   3. draw      (vision): the corrected detail as the v25.1 drawing model in real inches, with component ids per element,
//                assumed dimensions and what changed. Geometry is then checked deterministically (drawup-vdi-geometry.ts).
// Nothing the AI says about a code section or a manufacturer document is shown as verified unless research found an official
// URL for it in the web search results of that same job (verifySources below). Everything else is labelled unverified.

import { DETAIL_CATEGORIES, DETAIL_SCHEMA, cleanDetail } from '@/lib/drawup-detail-draw';
import { formatInches, regionsOf, validate, type Comp, type Drawing } from '@/lib/drawup-vdi-geometry';

const str = { type: 'string' };
const num = { type: 'number' };
const bool = { type: 'boolean' };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items: unknown) => ({ type: 'array', items });
const en = (values: string[]) => ({ type: 'string', enum: values });

export const ASSESSMENT = ['generally_coordinated', 'needs_clarification', 'needs_significant_revision', 'insufficient_documentation'];
export const FINDING_KINDS = ['confirmed_defect', 'likely_coordination_issue', 'missing_information', 'requires_professional_verification'];
export const PRIORITIES = ['high', 'medium', 'low'];
export const DISCIPLINES = ['architectural', 'structural', 'mep', 'envelope', 'fire', 'accessibility', 'drafting'];
export const CLASSES = ['foundations', 'slabs', 'exterior_walls', 'interior_partitions', 'roofs', 'parapets', 'curtain_walls', 'windows', 'doors', 'stairs', 'waterproofing', 'thermal_insulation', 'fire_rated_assemblies', 'structural_connections', 'envelope_transitions', 'accessibility'];
export const BASIS = ['mandatory_code', 'referenced_standard', 'manufacturer_requirement', 'industry_best_practice'];
const MARK = obj({ x: num, y: num });

/* ------------------------------------------------------------------ 1. review */
export const REVIEW_SCHEMA = obj({
  is_drawing: bool,
  drawing_kind: en(['detail', 'wall_section', 'building_section', 'plan', 'elevation', 'schedule', 'photo', 'sketch', 'other']),
  title: str,
  assembly: obj({ type: str, category: en(DETAIL_CATEGORIES), classes: arr(en(CLASSES)), materials: arr(str), exposure: str }),
  assessment: obj({ status: en(ASSESSMENT), headline: str, why: str }),
  looks_right: arr(str),
  components: arr(obj({ id: str, name: str, role: str, material: str, shown: en(['shown', 'partly_shown', 'not_shown']), marker: MARK })),
  findings: arr(obj({
    id: str, item: str, finding: str, recommendation: str, priority: en(PRIORITIES), kind: en(FINDING_KINDS), discipline: en(DISCIPLINES),
    component_id: str, marker: MARK,
    explain: obj({ does: str, problem: str, why_it_matters: str, solution: str, student: str, professional: str }),
    code_ids: arr(str), manufacturer_note: str,
  })),
  code_items: arr(obj({ id: str, code: str, section: str, topic: str, summary: str, applicability: str, basis: en(BASIS) })),
  jurisdiction_read: obj({ city: str, state: str, country: str, seen_on_drawing: bool }),
  search_terms: arr(str),
  manufacturer_hints: arr(obj({ manufacturer: str, product: str, why: str })),
  unresolved: arr(str),
  followup: obj({ question: str, why: str, options: arr(str) }),
  sheet_ref: obj({ detail_no: str, sheet_no: str, project_name: str }),
});

const PERSONA = {
  coach: 'You speak as ARCH COACH: an architectural educator and technical reviewer. Teach while you review: say what each part does and why it matters, plainly, and point to sources.',
  teammate: 'You speak as TEAMMATE: a collaborative architectural production assistant. Be brief and production-minded: what to fix on the sheet, what to coordinate with whom, and what the corrected detail needs.',
};

export function reviewInstructions(persona: 'coach' | 'teammate') {
  return `You are DrawUp's Visual Detail Intelligence reviewer, a senior architect and building-envelope consultant. ${PERSONA[persona]}
A member uploaded or pasted ONE architectural drawing (usually a construction detail). Review exactly what is drawn. You do not see
the rest of the set, the specifications, the structural drawings or the project's code analysis unless the member gives them.

RULES (follow all of them):
- Do not assume a detail is wrong because it differs from a common reference. Several correct ways exist for most assemblies.
- Classify every finding with kind: confirmed_defect (the drawing itself shows something that does not work, for example a
  membrane lapped the wrong way, a vapor retarder on the wrong side for the stated climate, two materials in the same space);
  likely_coordination_issue (probably resolved elsewhere in the set, e.g. footing size on structural sheets); missing_information
  (a dimension, note, size, callout or layer is not shown); requires_professional_verification (structure, fire rating,
  moisture/condensation risk, code compliance that depends on facts you do not have).
- Never make structural conclusions (sizes, reinforcing, anchorage capacity, bearing). Flag them as requires_professional_verification
  with discipline structural, and recommend coordinating with the structural drawings / engineer of record.
- Never say the drawing is code compliant. assessment.status is one of generally_coordinated, needs_clarification,
  needs_significant_revision, insufficient_documentation (use the last when the drawing is too unclear, partial or low
  resolution to judge). headline is one sentence like a senior reviewer would say it ("This foundation detail is close, but
  several areas need clarification before it should be issued for construction."). why explains the status in 1-3 sentences.
- looks_right: components that ARE correctly represented (be specific: "Rigid insulation is shown at the slab edge").
- components: every part of the assembly you can identify (slab, footing, stud wall, sheathing, WRB, flashing, insulation, vapor
  retarder, fill, anchor bolts, sill plate, finishes...), ids c1, c2... with what it does (role), its material, whether it is shown,
  and marker = its location on the uploaded image as fractions 0..1 of the image width (x, from left) and height (y, from top).
  Use x = -1, y = -1 if it is not shown.
- findings: ids F1, F2..., most important first, max 12. item = the component or topic (short), finding = what is wrong or missing
  on THIS drawing, recommendation = what to do, priority high/medium/low from the actual drawing and stated context (water,
  structure, fire and life safety are high when they are real). component_id links to components ("" if none). marker = where
  on the uploaded image (0..1 fractions as above, -1 when it is about something absent everywhere). explain: does (what the
  component does), problem, why_it_matters, solution (what an appropriate solution might look like, not one product),
  student (2-3 plain sentences for a student), professional (2-3 technical sentences). code_ids links to code_items.
  manufacturer_note: installation requirements that typically come from the product manufacturer ("" if none).
- code_items: requirements that may apply, ids K1, K2... code = the model code or standard (IBC, IRC, IECC, IEBC, IFC, ICC A117.1,
  2010 ADA Standards, ASTM E2112, ACI 318...). section = the model-code section ONLY if you are confident of it, else "".
  Never invent section numbers. topic = short topic. summary = what it generally requires (no edition-specific numbers unless the
  member gave the edition). applicability = the conditions under which it applies (occupancy, climate zone, construction type...).
  basis: mandatory_code, referenced_standard, manufacturer_requirement or industry_best_practice. Keep best practice separate from code.
  DrawUp verifies these later against the jurisdiction's ADOPTED edition with official sources; do not claim an edition is adopted.
- jurisdiction_read: the city/state/country if it is written on the drawing (title block, notes), else "". seen_on_drawing true only then.
- search_terms: 3-8 short phrases to find similar details (e.g. "slab on grade", "monolithic footing", "slab edge insulation").
- manufacturer_hints: only products or manufacturers written on the drawing or in the member's notes. [] otherwise. Never guess brands.
- unresolved: design decisions and facts that remain open (climate zone, frost depth, soil report, wall type, finish floor elevation...).
- followup: ONE question, the single most important unknown that would change the review (for example "Is this an exterior wall
  on a slab-on-grade foundation with a monolithic footing?"). If the jurisdiction is unknown and code items matter, the question
  may ask for it. why = one sentence. options = 0-4 short answer choices.
- sheet_ref: detail number, sheet number and project name if readable, else "".
- is_drawing false only if this is clearly not an architectural drawing (then still return the best review you can, status
  insufficient_documentation). title = a short detail title like "Slab Edge at Exterior Wall".
This is design-development guidance. A licensed professional must verify it.`;
}

/* ------------------------------------------------------------------ 2. research (web search) */
export const RESEARCH_SCHEMA = obj({
  adoption: obj({
    jurisdiction: str,
    status: en(['confirmed', 'partly_confirmed', 'not_found', 'not_attempted']),
    codes: arr(obj({ code: str, edition: str, amendments: str, effective: str, source_url: str })),
    note: str,
  }),
  code_checks: arr(obj({ id: str, code: str, edition: str, section: str, requirement: str, applicability: str, basis: en(BASIS), source_url: str, status: en(['verified', 'partly_verified', 'not_verified']), note: str })),
  manufacturer_refs: arr(obj({ manufacturer: str, product: str, title: str, region: str, revision: str, published: str, url: str, file_type: str, kind: en(['visual', 'technical', 'installation_guide', 'product_page']), why: str })),
});

export const RESEARCH_INSTRUCTIONS = `You are DrawUp's code and source researcher. Use web search. Only official or authoritative sources count:
the jurisdiction's own sites (state building code council / department of insurance / building department, *.gov), the ICC
(codes.iccsafe.org, iccsafe.org), the U.S. Access Board / ADA.gov, standards bodies (ASTM, NFPA, ACI) and the manufacturers'
own websites listed under APPROVED MANUFACTURER DOMAINS. Never cite forums, blogs, Q&A sites or AI summaries.
1. adoption: for JURISDICTION, find which edition of each relevant model code is ADOPTED and in effect (with state/local
   amendments), for the permit context given. The newest published edition is NOT automatically the adopted one. codes[] lists
   each code you could establish with edition, a note on amendments, the effective date if stated, and the official source_url
   you read it on. status: confirmed (all needed codes found on official pages), partly_confirmed, not_found, or not_attempted
   (when no jurisdiction was given: then codes = []).
2. code_checks: for each CODE ITEM given (keep its id), find the section in the ADOPTED edition when you can (codes.iccsafe.org
   free-to-read view is fine). requirement = what that section requires, in your words, briefly; applicability = conditions.
   status verified only when you opened an official page that states it, and source_url is that page; partly_verified when you
   found the section but not the adopted edition (or the reverse); not_verified otherwise, with source_url "". Never invent a
   section number: if you cannot find it, section = "" and status not_verified. edition = the adopted edition you established, else "".
3. manufacturer_refs: up to 6 technical documents from the APPROVED MANUFACTURER DOMAINS only (CAD detail pages, installation
   guides, technical manuals, product pages) relevant to the assembly. Copy the manufacturer's own document title; region = the
   market the document is for (e.g. "New Zealand"), revision / published as printed ("" if not shown); url = the page or file on
   the manufacturer's domain; kind visual (illustration / 3D / cutaway), technical (2D CAD / construction detail),
   installation_guide or product_page. why = one sentence on relevance, and say plainly when the region differs from the
   project's. [] when nothing relevant is found. Never invent URLs or titles.
   bimobject.com is a manufacturer content platform: use its public product pages, set manufacturer to the brand that
   published the object (not "BIMobject") and title to the product page's title. Prefer manufacturers architects in the
   project's market actually specify. Never use RevitCity, SketchUp 3D Warehouse, GrabCAD, BibLus/BiblioCAD, CAD-block
   download sites or any site where anyone can upload models: their content is not from the manufacturer.
Return JSON only.`;

/* ------------------------------------------------------------------ 3. draw (corrected detail) */
const baseDrawing = (DETAIL_SCHEMA as any).properties.drawing;
const baseEl = baseDrawing.properties.elements.items;
export const DRAW_SCHEMA = obj({
  ...(DETAIL_SCHEMA as any).properties,
  drawing: obj({
    ...baseDrawing.properties,
    elements: arr(obj({ ...baseEl.properties, comp: str })),
  }),
  components: arr(obj({ id: str, name: str, material: str, inferred: bool, continuous: bool })),
  assumed_dims: arr(obj({ what: str, value: str, why: str })),
  diffs: arr(obj({ finding_id: str, change: str })),
});

export const DRAW_EXTRA = `
THIS IS A VISUAL DETAIL INTELLIGENCE REDRAW. You also get DrawUp's REVIEW of the upload (findings F1.., components c1..) and,
when given, the member's ANSWERS to follow-up questions. Draw the corrected detail so it resolves the findings it can.
- components: reuse the review's component ids (c1, c2...) for parts that exist; add new ids (n1, n2...) for parts you add.
  inferred = true when the part or its size is not on the upload and not stated by the member (you assumed it). continuous = true
  for control layers that must be continuous (air barrier, WRB, vapor retarder, flashing, insulation line).
- Every drawing element has comp = the component id it belongs to ("" only for break lines and reference lines).
- Do not invent exact construction dimensions. Where a size is not on the upload or in the answers, draw a typical size and list it
  in assumed_dims (what, value, why) so the member can confirm it. Structural sizes (footing, rebar, anchors, slab thickness) are
  ALWAYS assumed unless given: label those notes "VERIFY W/ STRUCT." and never present them as designed.
- Dimension labels must equal the drawn length (DrawUp measures every dimension and rejects mismatches).
- diffs: one entry per change from the original, with the finding id it answers ("" for drafting clean-up).
- flaws: reuse the review's findings (severity critical/major/minor from priority high/medium/low).`;

/* ------------------------------------------------------------------ cleaners */
const s = (v: any, max = 400) => String(v ?? '').slice(0, max).trim();
const pick = <T extends string>(v: any, list: T[], d: T): T => (list.includes(v) ? v : d);
const list = (v: any, k: number, max: number) => (Array.isArray(v) ? v : []).slice(0, k).map((x: any) => s(x, max)).filter(Boolean);
const frac = (v: any) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1 ? Math.round(n * 10000) / 10000 : -1; };
const mark = (m: any) => { const x = frac(m?.x), y = frac(m?.y); return x < 0 || y < 0 ? null : { x, y }; };
const id = (v: any, d: string) => (s(v, 12).replace(/[^A-Za-z0-9_-]/g, '') || d);

export function cleanReview(m: any) {
  const comps = (Array.isArray(m?.components) ? m.components : []).slice(0, 30).map((c: any, i: number) => ({ id: id(c?.id, 'c' + (i + 1)), name: s(c?.name, 80), role: s(c?.role, 300), material: s(c?.material, 120), shown: pick(c?.shown, ['shown', 'partly_shown', 'not_shown'], 'shown'), marker: mark(c?.marker) })).filter((c: any) => c.name);
  const codes = (Array.isArray(m?.code_items) ? m.code_items : []).slice(0, 16).map((k: any, i: number) => ({ id: id(k?.id, 'K' + (i + 1)), code: s(k?.code, 60), section: s(k?.section, 40), topic: s(k?.topic, 120), summary: s(k?.summary, 600), applicability: s(k?.applicability, 400), basis: pick(k?.basis, BASIS, 'industry_best_practice') })).filter((k: any) => k.code || k.topic);
  return {
    is_drawing: m?.is_drawing !== false,
    drawing_kind: s(m?.drawing_kind, 30) || 'detail',
    title: s(m?.title, 120) || 'Drawing review',
    assembly: { type: s(m?.assembly?.type, 160), category: pick(m?.assembly?.category, DETAIL_CATEGORIES, 'Typical Details'), classes: (Array.isArray(m?.assembly?.classes) ? m.assembly.classes : []).filter((c: any) => CLASSES.includes(c)).slice(0, 6), materials: list(m?.assembly?.materials, 16, 80), exposure: s(m?.assembly?.exposure, 200) },
    assessment: { status: pick(m?.assessment?.status, ASSESSMENT, 'needs_clarification'), headline: s(m?.assessment?.headline, 400), why: s(m?.assessment?.why, 800) },
    looks_right: list(m?.looks_right, 12, 300),
    components: comps,
    findings: (Array.isArray(m?.findings) ? m.findings : []).slice(0, 12).map((f: any, i: number) => ({
      id: id(f?.id, 'F' + (i + 1)), item: s(f?.item, 80), finding: s(f?.finding, 500), recommendation: s(f?.recommendation, 500),
      priority: pick(f?.priority, PRIORITIES, 'medium'), kind: pick(f?.kind, FINDING_KINDS, 'missing_information'), discipline: pick(f?.discipline, DISCIPLINES, 'architectural'),
      component_id: s(f?.component_id, 12), marker: mark(f?.marker),
      explain: { does: s(f?.explain?.does, 400), problem: s(f?.explain?.problem, 500), why_it_matters: s(f?.explain?.why_it_matters, 500), solution: s(f?.explain?.solution, 500), student: s(f?.explain?.student, 600), professional: s(f?.explain?.professional, 600) },
      code_ids: list(f?.code_ids, 6, 12), manufacturer_note: s(f?.manufacturer_note, 400),
    })).filter((f: any) => f.finding),
    code_items: codes,
    jurisdiction_read: { city: s(m?.jurisdiction_read?.city, 80), state: s(m?.jurisdiction_read?.state, 80), country: s(m?.jurisdiction_read?.country, 80), seen_on_drawing: m?.jurisdiction_read?.seen_on_drawing === true },
    search_terms: list(m?.search_terms, 8, 60),
    manufacturer_hints: (Array.isArray(m?.manufacturer_hints) ? m.manufacturer_hints : []).slice(0, 6).map((h: any) => ({ manufacturer: s(h?.manufacturer, 80), product: s(h?.product, 120), why: s(h?.why, 200) })).filter((h: any) => h.manufacturer),
    unresolved: list(m?.unresolved, 10, 300),
    followup: { question: s(m?.followup?.question, 400), why: s(m?.followup?.why, 300), options: list(m?.followup?.options, 4, 120) },
    sheet_ref: { detail_no: s(m?.sheet_ref?.detail_no, 12), sheet_no: s(m?.sheet_ref?.sheet_no, 16), project_name: s(m?.sheet_ref?.project_name, 120) },
  };
}
export type Review = ReturnType<typeof cleanReview>;

/** The corrected detail: v25.1 detail model + component ids per element. Elements are filtered the same way cleanDetail does,
 *  before cleanDetail, so element i and comp i stay aligned. */
export function cleanDraw(m: any) {
  const KINDS = ['rect', 'poly', 'polyline', 'line', 'circle', 'batt', 'blk', 'blk1', 'brk'];
  const raw = (Array.isArray(m?.drawing?.elements) ? m.drawing.elements : []).slice(0, 500)
    .filter((e: any) => Array.isArray(e?.pts) && e.pts.length >= ((KINDS.includes(e?.kind) ? e.kind : 'line') === 'poly' ? 3 : 2));
  const d = cleanDetail({ ...m, drawing: { ...(m?.drawing || {}), elements: raw } });
  const elements = d.drawing.elements.map((e: any, i: number) => ({ ...e, comp: s(raw[i]?.comp, 12).replace(/[^A-Za-z0-9_-]/g, '') }));
  const components: Comp[] = (Array.isArray(m?.components) ? m.components : []).slice(0, 40).map((c: any, i: number) => ({ id: id(c?.id, 'n' + (i + 1)), name: s(c?.name, 80), material: s(c?.material, 120), inferred: c?.inferred === true, continuous: c?.continuous === true })).filter((c: Comp) => c.name);
  return {
    ...d,
    drawing: { ...d.drawing, elements, components },
    assumed_dims: (Array.isArray(m?.assumed_dims) ? m.assumed_dims : []).slice(0, 20).map((a: any) => ({ what: s(a?.what, 120), value: s(a?.value, 40), why: s(a?.why, 300) })).filter((a: any) => a.what),
    diffs: (Array.isArray(m?.diffs) ? m.diffs : []).slice(0, 30).map((x: any) => ({ finding_id: s(x?.finding_id, 12), change: s(x?.change, 400) })).filter((x: any) => x.change),
  };
}
export function checkDrawing(drawing: any) {
  return validate(drawing as Drawing, (drawing?.components || []) as Comp[]);
}

/* ------------------------------------------------------------------ source verification */
const OFFICIAL_CODE_HOSTS = [/\.gov$/i, /(^|\.)iccsafe\.org$/i, /(^|\.)ada\.gov$/i, /(^|\.)access-board\.gov$/i, /(^|\.)astm\.org$/i, /(^|\.)nfpa\.org$/i, /(^|\.)concrete\.org$/i, /(^|\.)\w+\.gov\.\w+$/i, /(^|\.)govt\.nz$/i, /(^|\.)gov\.uk$/i, /(^|\.)gc\.ca$/i];
const host = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
export const isOfficialCodeUrl = (u: string) => OFFICIAL_CODE_HOSTS.some(r => r.test(host(u)));
/** User-upload model sites: never a source, whatever the AI or a settings row says (Jaja, 2026-10-27: "stay away from revit city"). */
export const BLOCKED_HOSTS = ['revitcity.com', '3dwarehouse.sketchup.com', 'grabcad.com', 'bibliocad.com', 'cadblocksfree.com', 'cad-blocks.net', 'dwgmodels.com', 'cadforum.cz', 'free-cad-blocks.com', 'turbosquid.com', 'cgtrader.com', 'sketchfab.com'];
export const isBlockedHost = (u: string) => { const h = host(u); return !!h && BLOCKED_HOSTS.some(d => h === d || h.endsWith('.' + d)); };
export const onDomain = (u: string, domains: string[]) => { const h = host(u); return !!h && domains.some(d => h === d || h.endsWith('.' + d)); };

/** Every URL the research job actually consulted or cited (web_search_call.action.sources + url_citation annotations). */
export function consultedUrls(data: any) {
  const out = new Set<string>();
  for (const item of data?.output || []) {
    for (const src of item?.action?.sources || []) if (src?.url) out.add(String(src.url));
    for (const c of item?.content || []) for (const a of c?.annotations || []) if (a?.url) out.add(String(a.url));
  }
  return out;
}
const norm = (u: string) => String(u || '').replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();

/** Downgrades anything the research job claims without an official URL it really consulted. */
export function verifySources(r: any, data: any, manufacturerDomains: string[]) {
  const seen = new Set([...consultedUrls(data)].map(norm));
  // Exact URL match only: a path the model made up on a real host does not count.
  const real = (u: string) => !!u && !isBlockedHost(u) && seen.has(norm(u));
  const adoption = {
    jurisdiction: s(r?.adoption?.jurisdiction, 120),
    status: pick(r?.adoption?.status, ['confirmed', 'partly_confirmed', 'not_found', 'not_attempted'], 'not_found'),
    note: s(r?.adoption?.note, 600),
    codes: (Array.isArray(r?.adoption?.codes) ? r.adoption.codes : []).slice(0, 10).map((c: any) => {
      const url = s(c?.source_url, 500), ok = real(url) && isOfficialCodeUrl(url);
      return { code: s(c?.code, 80), edition: s(c?.edition, 40), amendments: s(c?.amendments, 300), effective: s(c?.effective, 40), source_url: ok ? url : '', verified: ok };
    }).filter((c: any) => c.code),
  };
  if (adoption.status === 'confirmed' && adoption.codes.some((c: any) => !c.verified)) adoption.status = 'partly_confirmed';
  if (adoption.codes.length && adoption.codes.every((c: any) => !c.verified)) adoption.status = 'not_found';
  const code_checks = (Array.isArray(r?.code_checks) ? r.code_checks : []).slice(0, 20).map((c: any) => {
    const url = s(c?.source_url, 500), ok = real(url) && isOfficialCodeUrl(url);
    let status = pick(c?.status, ['verified', 'partly_verified', 'not_verified'], 'not_verified');
    if (!ok && status !== 'not_verified') status = 'not_verified';
    return { id: s(c?.id, 12), code: s(c?.code, 80), edition: s(c?.edition, 40), section: s(c?.section, 40), requirement: s(c?.requirement, 600), applicability: s(c?.applicability, 400), basis: pick(c?.basis, BASIS, 'mandatory_code'), source_url: ok ? url : '', status, note: s(c?.note, 400) + (!ok && c?.source_url ? ' (the cited page could not be confirmed as an official source, so it is not shown)' : '') };
  });
  const manufacturer_refs = (Array.isArray(r?.manufacturer_refs) ? r.manufacturer_refs : []).slice(0, 8).map((m: any) => ({
    manufacturer: s(m?.manufacturer, 80), product: s(m?.product, 120), title: s(m?.title, 200), region: s(m?.region, 80), revision: s(m?.revision, 40), published: s(m?.published, 40),
    url: s(m?.url, 600), file_type: s(m?.file_type, 20), kind: pick(m?.kind, ['visual', 'technical', 'installation_guide', 'product_page'], 'technical'), why: s(m?.why, 300),
  })).filter((m: any) => m.title && m.url && onDomain(m.url, manufacturerDomains.filter(d => !BLOCKED_HOSTS.includes(d))) && real(m.url));
  return { adoption, code_checks, manufacturer_refs, consulted: seen.size };
}

/** "Raleigh, NC" -> "us-nc-raleigh" (cache key for code adoption). */
export function jurisdictionKey(j: { city?: string; state?: string; country?: string }) {
  const k = (v?: string) => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const c = k(j.country) || 'us';
  return [c === 'united-states' || c === 'usa' ? 'us' : c, k(j.state), k(j.city)].filter(Boolean).join('-');
}

/* ------------------------------------------------------------------ 4. AI 3D illustration, anchored to the geometry */
/** Each drawn part with its real size from the corrected geometry, so the illustration is told the true layer sizes. */
export function partSizes(drawing: any) {
  const comps: Comp[] = drawing?.components || [];
  const regs = regionsOf(drawing as Drawing, comps);
  return comps.map(c => {
    const mine = regs.filter(r => r.comp === c.id);
    if (!mine.length) return null;
    const xs = mine.flatMap(r => r.pts.map(p => p[0])), ys = mine.flatMap(r => r.pts.map(p => p[1]));
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    return { id: c.id, name: c.name, material: c.material, thick: mine.every(r => r.thin) ? 'membrane / sheet' : formatInches(Math.min(w, h)), long: formatInches(Math.max(w, h)), inferred: !!c.inferred, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
  }).filter(Boolean) as { id: string; name: string; material: string; thick: string; long: string; inferred: boolean; cx: number; cy: number }[];
}
export function imagePrompt(title: string, drawing: any, fix: string[] = []) {
  const parts = partSizes(drawing).sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  return [
    `Make a photorealistic architectural cutaway illustration of this construction assembly: ${title}.`,
    'The attached image is DrawUp\'s exact 3D model of the assembly, built from the dimensioned section. It is the ground truth.',
    'Keep EXACTLY: the same camera angle and framing, the same parts, the same number of layers, their order, their relative thickness and proportions, the same gaps between exploded parts, and where each part starts and stops. Do not add, remove, merge, split, reorder, resize or move any part. Do not add fasteners, trim, plants, people, sky or buildings that are not in the model.',
    'Only change the surface appearance: give each part the real material named below (true colour and texture), with soft studio lighting and soft shadows on a plain light grey background.',
    'PARTS (bottom to top, then left to right), with sizes read from the drawing:',
    ...parts.map((p, i) => `${i + 1}. ${p.name}: ${p.material || 'as shown'}; ${p.thick === 'membrane / sheet' ? 'thin sheet / membrane' : p.thick + ' thick'}${p.inferred ? ' (assumed part)' : ''}`),
    'No text, labels, dimensions, arrows, logos or watermarks in the picture.',
    ...(fix.length ? ['A previous attempt was checked against the model and was wrong. Fix these:', ...fix.map(f => '- ' + f)] : []),
  ].join('\n');
}
export const IMAGE_CHECK_SCHEMA = obj({ matches: bool, score: num, missing: arr(str), extra: arr(str), wrong: arr(str), note: str });
export const IMAGE_CHECK_INSTRUCTIONS = `You check an AI illustration against DrawUp's exact 3D model of a construction assembly. Image 1 is the model (ground
truth). Image 2 is the illustration. PARTS lists every part. Compare part by part: is each part present, in the same order and
position, with about the same thickness (within ~25%), the same material, and nothing extra? missing = parts absent or
unrecognisable; extra = things in the illustration that are not in the model; wrong = wrong order, size, position, material or
camera. score = 0-100 for geometric faithfulness. matches = true only if nothing is missing, nothing extra is structural, and
nothing is in the wrong order. note = one plain sentence for the member. Return JSON only.`;
export function cleanImageCheck(m: any) {
  return { matches: m?.matches === true, score: Math.max(0, Math.min(100, Math.round(Number(m?.score) || 0))), missing: list(m?.missing, 12, 160), extra: list(m?.extra, 12, 160), wrong: list(m?.wrong, 12, 200), note: s(m?.note, 300) };
}
