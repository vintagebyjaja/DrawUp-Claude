import { awardXp } from '@/lib/drawup-coach-persona';
import { DETAIL_INSTRUCTIONS } from '@/lib/drawup-detail-draw';
import {
  DRAW_EXTRA, DRAW_SCHEMA, RESEARCH_INSTRUCTIONS, RESEARCH_SCHEMA, REVIEW_SCHEMA, checkDrawing, cleanDraw, cleanReview,
  jurisdictionKey, reviewInstructions, verifySources,
} from '@/lib/drawup-vdi';
import {
  PRIVATE_BUCKET, adminRest, creditMessage, missingConfig, models, openaiBackground, openaiGet, outputText, pathIsOwn,
  refundOnce, reserveCredits, signedInUser, storageSignedUrls, storageUpload, type CreditAccess,
} from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V27 Visual Detail Intelligence 1.0. One drawing in (uploaded or pasted), a full review package out:
//   start     { start: { pictures: [{ path } | { image }], notes, file_name, persona, jurisdiction: { city, state, country,
//               permit }, project_id? } } -> { id }  (credits DRAWUP_VDI_COST, default 20: review + sources + corrected detail)
//   poll      { poll: <review id> } -> the review row. Each poll collects finished AI jobs and starts the next ones, so the
//             page shows the assessment first, then sources, then the corrected 2D detail (the 3D is built in the browser).
//   answer    { answer: <id>, text }: the answer to the follow-up question refines the same review (DRAWUP_VDI_REFINE_COST, 3)
//   place     { place: <id>, city, state, country, permit }: sets the jurisdiction and re-checks the code items (same cost)
//   redraw    { redraw: <id> }: draws the corrected detail again with the answers so far (DRAWUP_VDI_REDRAW_COST, 10;
//             free once after a failed drawing)
//   save_edit { save_edit: <id>, drawing }: the member's vector edits, checked and saved as the next revision (free)
//   image     { image: <id> }: optional AI 3D illustration (DRAWUP_VDI_AI_IMAGE=on to enable; DRAWUP_VDI_IMAGE_COST, 8)
// Same Cloudflare pattern as v25.1: every AI call is an OpenAI background response; no request waits on the AI.
// Settings: DRAWUP_VDI_MODEL (review + drawing, default gpt-5), DRAWUP_VDI_RESEARCH_MODEL (default gpt-5-mini),
// DRAWUP_VDI_WEB_SEARCH (on | off, default on), DRAWUP_VDI_EFFORT (minimal | low | medium, default low).

const MAX_PICTURES = 3;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_MAX_MS = 40 * 60 * 1000;
const FALLBACK_DOMAINS = ['jameshardie.co.nz'];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const price = (name: string, d: number) => Math.max(0, Math.round(Number(process.env[name]) || d));
const str = (v: unknown, max: number) => String(v ?? '').slice(0, max).trim();
const effort = () => (['minimal', 'low', 'medium'].includes(String(process.env.DRAWUP_VDI_EFFORT)) ? process.env.DRAWUP_VDI_EFFORT : 'low');
const webSearchOn = () => process.env.DRAWUP_VDI_WEB_SEARCH !== 'off';
const now = () => new Date().toISOString();

type Job = { r?: string; model?: string; status: 'starting' | 'running' | 'done' | 'failed'; at: string; error?: string; access?: CreditAccess; retried?: boolean; text?: string };
type Row = Record<string, any> & { id: string; owner_id: string; jobs: Record<string, Job> };

async function rows<T = any>(query: string): Promise<T[]> {
  const r = await adminRest(query);
  return r.ok ? ((await r.json()) || []) : [];
}
async function loadOwn(id: string, userId: string): Promise<Row | null> {
  if (!UUID_RE.test(id)) return null;
  return (await rows<Row>(`vdi_reviews?id=eq.${id}&owner_id=eq.${userId}&select=*&limit=1`))[0] || null;
}
async function patch(id: string, fields: Record<string, unknown>, onlyIf = '') {
  const r = await adminRest(`vdi_reviews?id=eq.${id}${onlyIf}`, { method: 'PATCH', body: JSON.stringify({ ...fields, updated_at: now() }) });
  const out = r.ok ? await r.json().catch(() => []) : [];
  return Array.isArray(out) ? out[0] || null : null;
}
/** Client-facing row: no job internals (credit records, AI ids). */
function view(row: Row) {
  const jobs: Record<string, any> = {};
  for (const [k, j] of Object.entries(row.jobs || {})) jobs[k] = { status: j.status, at: j.at, error: j.error || undefined };
  const { jobs: _j, ...rest } = row;
  return { ...rest, jobs, web_search: webSearchOn(), ai_image: process.env.DRAWUP_VDI_AI_IMAGE === 'on' };
}
async function manufacturerDomains() {
  const r = await rows<{ domain: string }>('vdi_manufacturer_sources?approved=eq.true&select=domain');
  return r.length ? r.map(x => x.domain) : FALLBACK_DOMAINS;
}
async function pictureUrls(row: Row) {
  const paths = (row.source_paths || []).filter((p: string) => pathIsOwn(p, row.owner_id));
  let links: (string | null)[] = [];
  try { links = await storageSignedUrls(PRIVATE_BUCKET, paths, 3600); } catch { links = []; }
  return links.filter(Boolean) as string[];
}
const placeLine = (j: any) => [j?.city, j?.state, j?.country].filter(Boolean).join(', ');

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to review a drawing.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'Drawing review is not connected yet: ' + notReady }, 503);
  if (Number(request.headers.get('content-length') || 0) > 14 * 1024 * 1024) return json({ error: 'That picture is too large to send. Try a smaller one.' }, 413);
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.start) return await start(user, body.start);
    if (typeof body?.poll === 'string') return await poll(user, body.poll);
    if (typeof body?.answer === 'string') return await answer(user, body.answer, body.text);
    if (typeof body?.place === 'string') return await place(user, body.place, body);
    if (typeof body?.redraw === 'string') return await redraw(user, body.redraw);
    if (typeof body?.save_edit === 'string') return await saveEdit(user, body.save_edit, body.drawing);
    if (typeof body?.image === 'string') return await image(user, body.image);
  } catch (e: any) {
    console.error('[drawup] vdi', e);
    return json({ error: /relation|schema cache|does not exist/i.test(String(e?.message)) ? 'Run the v27 SQL in Supabase first.' : e?.message || 'DrawUp could not do that.' }, 500);
  }
  return json({ error: 'Unknown request.' }, 400);
}

/* ------------------------------------------------------------------ start */
async function start(user: { id: string; is_anonymous?: boolean }, b: any) {
  const pics: { path?: string; image?: string }[] = (Array.isArray(b?.pictures) ? b.pictures : []).slice(0, MAX_PICTURES + 1).map((p: any) => ({ path: typeof p?.path === 'string' ? p.path : undefined, image: typeof p?.image === 'string' ? p.image : undefined }));
  if (!pics.length) return json({ error: 'Add a picture of the drawing (upload, drop or paste it).' }, 400);
  if (pics.length > MAX_PICTURES) return json({ error: `Use up to ${MAX_PICTURES} pictures for one review.` }, 400);
  if (pics.some(p => (p.path ? !pathIsOwn(p.path, user.id) : !(p.image && IMG_RE.test(p.image))))) return json({ error: 'One of the pictures is not an image DrawUp can read.' }, 400);
  const persona = b?.persona === 'teammate' ? 'teammate' : 'coach';
  const j = { city: str(b?.jurisdiction?.city, 80), state: str(b?.jurisdiction?.state, 80), country: str(b?.jurisdiction?.country, 80) || 'United States', permit: str(b?.jurisdiction?.permit, 200) };
  let projectId: string | null = null;
  if (b?.project_id && UUID_RE.test(String(b.project_id))) {
    const p = (await rows(`project_threads?id=eq.${b.project_id}&owner_id=eq.${user.id}&select=id,location&limit=1`))[0];
    if (p) { projectId = p.id; if (!j.city && !j.state && p.location) j.permit = (j.permit ? j.permit + '; ' : '') + 'Project location: ' + str(p.location, 120); }
  }
  const cost = price('DRAWUP_VDI_COST', 20);
  const access = await reserveCredits(user, cost, 'vdi_review');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);

  // Pasted pictures that could not be uploaded by the page are stored now, so later jobs can sign links to them.
  const id = crypto.randomUUID(), paths: string[] = [];
  for (let i = 0; i < pics.length; i++) {
    const p = pics[i];
    if (p.path) { paths.push(p.path); continue; }
    const m = p.image!.match(/^data:(image\/\w+);base64,(.*)$/)!, path = `${user.id}/vdi/${id}/pasted-${i + 1}.${m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg'}`;
    try { await storageUpload(PRIVATE_BUCKET, path, Uint8Array.from(Buffer.from(m[2], 'base64')), m[1]); paths.push(path); }
    catch (e: any) { await refundOnce(user.id, access, 'vdi_review_refund', id); return json({ error: 'The picture could not be stored: ' + e.message + ' You were not charged.' }, 500); }
  }
  const ins = await adminRest('vdi_reviews', { method: 'POST', body: JSON.stringify({ id, owner_id: user.id, project_id: projectId, persona, title: str(b?.file_name, 120) || 'Drawing review', source_paths: paths, file_name: str(b?.file_name, 160) || null, notes: str(b?.notes, 2000) || null, jurisdiction: j, stage: 'reviewing', jobs: { review: { status: 'starting', at: now(), access } }, credits_charged: access.credits_charged ?? 0 }) });
  if (!ins.ok) { await refundOnce(user.id, access, 'vdi_review_refund', id); const t = await ins.text(); return json({ error: (/relation|does not exist|schema cache/i.test(t) ? 'Run the v27 SQL in Supabase first.' : 'The review could not be saved.') + ' You were not charged.' }, 500); }
  const row = (await ins.json())[0] as Row;
  const ok = await startReview(row, 'review');
  if (!ok.ok) { await refundOnce(user.id, access, 'vdi_review_refund', id); await patch(id, { stage: 'failed', jobs: { review: { status: 'failed', at: now(), error: ok.error } } }); return json({ error: ok.error + ' You were not charged.' }, 502); }
  return json({ id, status: 'running', credits_charged: access.credits_charged ?? 0 });
}

/** Review (or refine) job: the picture(s), the member's notes and place, earlier Q&A, and on a refine the previous review. */
async function startReview(row: Row, kind: 'review' | 'refine', extra?: { question: string; answer: string }) {
  const urls = await pictureUrls(row);
  if (!urls.length) return { ok: false, error: 'The picture could not be read.' };
  const content: any[] = [];
  urls.forEach((u, i) => content.push({ type: 'input_text', text: i === 0 ? 'THE DRAWING' : `MORE CONTEXT ${i}` }, { type: 'input_image', image_url: u, detail: 'high' }));
  const qa = [...(row.followups || []), ...(extra ? [{ q: extra.question, a: extra.answer }] : [])];
  content.push({ type: 'input_text', text: [
    `MEMBER NOTES: ${row.notes || '(none)'}`,
    `FILE NAME: ${row.file_name || '(pasted)'}`,
    `PROJECT PLACE: ${placeLine(row.jurisdiction) || 'not given'}${row.jurisdiction?.permit ? ' · permit context: ' + row.jurisdiction.permit : ''}`,
    qa.length ? 'ANSWERS FROM THE MEMBER (use them; do not ask these again):\n' + qa.map((x: any) => `Q: ${x.q}\nA: ${x.a}`).join('\n') : '',
  ].filter(Boolean).join('\n') });
  if (kind === 'refine' && row.review) content.push({ type: 'input_text', text: 'YOUR PREVIOUS REVIEW (refine it with the new answer; keep finding ids stable, drop findings the answer resolves, add new ones it reveals, ask the next most important question or "" if none):\n' + JSON.stringify(row.review).slice(0, 60000) });
  const payload = { instructions: reviewInstructions(row.persona === 'teammate' ? 'teammate' : 'coach'), input: [{ role: 'user', content }], reasoning: { effort: effort() }, max_output_tokens: 14000, text: { format: { type: 'json_schema', name: 'drawup_vdi_review', strict: true, schema: REVIEW_SCHEMA } } };
  try {
    const made = await openaiBackground(payload, models(process.env.DRAWUP_VDI_MODEL, 'gpt-5', 'gpt-5-mini'));
    const jobs = { ...(row.jobs || {}), [kind]: { ...(row.jobs?.[kind] || {}), r: made.id, model: made.model, status: 'running', at: now(), error: undefined, ...(extra ? { text: JSON.stringify(extra).slice(0, 2400) } : {}) } };
    await patch(row.id, { jobs, stage: kind === 'review' ? 'reviewing' : row.stage });
    row.jobs = jobs as any;
    return { ok: true };
  } catch (e: any) { return { ok: false, error: e?.message || 'The review could not start.' }; }
}

async function startResearch(row: Row) {
  if (!webSearchOn()) return { ok: false, skipped: true, error: 'Web search is off (DRAWUP_VDI_WEB_SEARCH=off).' };
  const r = row.review || {}, j = row.jurisdiction || {}, place = placeLine(j);
  const domains = await manufacturerDomains();
  const key = place ? jurisdictionKey(j) : '';
  const cached = key ? await rows(`vdi_code_adoptions?jurisdiction_key=eq.${encodeURIComponent(key)}&checked_at=gte.${new Date(Date.now() - 90 * 864e5).toISOString()}&select=code,edition,amendments,effective,source_url`) : [];
  const text = [
    `JURISDICTION: ${place || 'NOT GIVEN (set adoption.status not_attempted; still find model-code sections, marking edition "")'}${j.permit ? '\nPERMIT CONTEXT: ' + j.permit : ''}`,
    cached.length ? 'KNOWN ADOPTION (read on official pages within 90 days; re-check only if unsure):\n' + JSON.stringify(cached) : '',
    `ASSEMBLY: ${r.assembly?.type || r.title || 'construction detail'} (${(r.assembly?.classes || []).join(', ')}); materials: ${(r.assembly?.materials || []).join(', ')}; exposure: ${r.assembly?.exposure || 'not stated'}`,
    'CODE ITEMS:\n' + JSON.stringify(r.code_items || []),
    `MANUFACTURER HINTS: ${JSON.stringify(r.manufacturer_hints || [])}`,
    `SEARCH TERMS: ${(r.search_terms || []).join('; ')}`,
    `APPROVED MANUFACTURER DOMAINS: ${domains.join(', ')}`,
  ].filter(Boolean).join('\n\n');
  const payload = { instructions: RESEARCH_INSTRUCTIONS, input: [{ role: 'user', content: [{ type: 'input_text', text }] }], tools: [{ type: 'web_search' }], include: ['web_search_call.action.sources'], reasoning: { effort: 'low' }, max_output_tokens: 12000, text: { format: { type: 'json_schema', name: 'drawup_vdi_research', strict: true, schema: RESEARCH_SCHEMA } } };
  try {
    const made = await openaiBackground(payload, models(process.env.DRAWUP_VDI_RESEARCH_MODEL, 'gpt-5-mini', 'gpt-5'));
    return { ok: true, job: { r: made.id, model: made.model, status: 'running', at: now() } as Job };
  } catch (e: any) { return { ok: false, error: e?.message || 'Research could not start.' }; }
}

async function startDraw(row: Row) {
  const urls = await pictureUrls(row);
  const content: any[] = [];
  urls.forEach((u, i) => content.push({ type: 'input_text', text: i === 0 ? 'THE UPLOADED DETAIL' : `MORE CONTEXT ${i}` }, { type: 'input_image', image_url: u, detail: 'high' }));
  content.push({ type: 'input_text', text: [
    `MEMBER NOTES: ${row.notes || '(none)'}`,
    `PROJECT PLACE: ${placeLine(row.jurisdiction) || 'not given'}`,
    (row.followups || []).length ? 'ANSWERS:\n' + row.followups.map((x: any) => `Q: ${x.q}\nA: ${x.a}`).join('\n') : '',
    'REVIEW:\n' + JSON.stringify({ title: row.review?.title, assembly: row.review?.assembly, components: row.review?.components, findings: (row.review?.findings || []).map((f: any) => ({ id: f.id, item: f.item, finding: f.finding, recommendation: f.recommendation, priority: f.priority, kind: f.kind })), unresolved: row.review?.unresolved }).slice(0, 50000),
  ].filter(Boolean).join('\n\n') });
  const payload = { instructions: DETAIL_INSTRUCTIONS + DRAW_EXTRA, input: [{ role: 'user', content }], reasoning: { effort: effort() }, max_output_tokens: 20000, text: { format: { type: 'json_schema', name: 'drawup_vdi_detail', strict: true, schema: DRAW_SCHEMA } } };
  try {
    const made = await openaiBackground(payload, models(process.env.DRAWUP_VDI_MODEL, 'gpt-5', 'gpt-5-mini'));
    return { ok: true, job: { r: made.id, model: made.model, status: 'running', at: now() } as Job };
  } catch (e: any) { return { ok: false, error: e?.message || 'The corrected detail could not start.' }; }
}

/** Starts research + drawing once the review is in. Claimed with a conditional update so two polls never start them twice. */
async function startFollowOn(row: Row, which: ('research' | 'draw')[]) {
  const claim: Record<string, Job> = { ...row.jobs };
  which.forEach(k => { claim[k] = { ...(row.jobs?.[k] || {}), status: 'starting', at: now(), error: undefined } as Job; });
  const claimed = await patch(row.id, { jobs: claim }, `&updated_at=eq.${encodeURIComponent(row.updated_at)}`);
  if (!claimed) return (await rows<Row>(`vdi_reviews?id=eq.${row.id}&select=*&limit=1`))[0] || row;
  const [res, drw] = await Promise.all([which.includes('research') ? startResearch(row) : null, which.includes('draw') ? startDraw(row) : null]);
  const jobs = { ...claim };
  if (res) jobs.research = res.ok ? res.job! : { status: res.skipped ? 'done' : 'failed', at: now(), error: res.error };
  if (drw) jobs.draw = drw.ok ? { ...drw.job!, retried: row.jobs?.draw?.retried } : { status: 'failed', at: now(), error: drw.error, retried: row.jobs?.draw?.retried };
  const stage = drw ? 'drawing' : row.stage;
  return (await patch(row.id, { jobs, stage })) || { ...row, jobs, stage };
}

/* ------------------------------------------------------------------ poll */
async function poll(user: { id: string }, id: string) {
  let row = await loadOwn(id, user.id);
  if (!row) return json({ error: 'That review could not be found.', final: true }, 404);
  const jobs = { ...(row.jobs || {}) };
  let changed = false, fields: Record<string, unknown> = {};
  const after: ('research' | 'draw')[] = [];

  for (const kind of ['review', 'refine', 'research', 'draw', 'image'] as const) {
    const j = jobs[kind];
    if (!j || !j.r) {
      // a claim that never got its AI id (the request died between the two writes) is released after 2 minutes
      if (j?.status === 'starting' && Date.now() - Date.parse(j.at) > 120000) { jobs[kind] = { ...j, status: 'failed', error: 'It did not start. Try again.' }; changed = true; }
      continue;
    }
    if (j.status !== 'running') continue;
    if (Date.now() - Date.parse(j.at) > JOB_MAX_MS) { jobs[kind] = { ...j, status: 'failed', error: 'It took too long.' }; changed = true; continue; }
    let data: any;
    try { data = await openaiGet(j.r); } catch { continue; }
    if (data?.status === 'queued' || data?.status === 'in_progress') continue;
    changed = true;
    if (data?.status !== 'completed') {
      const why = data?.status === 'incomplete' ? 'the AI reached its output limit' : data?.error?.message || 'the AI job failed';
      jobs[kind] = { ...j, status: 'failed', error: why };
      if (kind === 'review') { await refundOnce(user.id, j.access, 'vdi_review_refund', row.id); fields.stage = 'failed'; }
      else if (j.access) await refundOnce(user.id, j.access, `vdi_${kind}_refund`, j.r);
      if (kind === 'draw') fields.stage = 'reviewed';
      continue;
    }
    try {
      if (kind === 'review' || kind === 'refine') {
        const rv = cleanReview(JSON.parse(outputText(data)));
        fields.review = rv; fields.title = rv.title || row.title;
        // a jurisdiction written on the drawing fills an empty place
        const jr = rv.jurisdiction_read, place = { ...(row.jurisdiction || {}) };
        if (jr.seen_on_drawing && !place.city && !place.state && (jr.city || jr.state)) { place.city = jr.city; place.state = jr.state; place.country = jr.country || place.country; place.from_drawing = true; fields.jurisdiction = place; }
        if (kind === 'refine' && j.text) { try { const qa = JSON.parse(j.text); fields.followups = [...(row.followups || []), { q: qa.question, a: qa.answer, at: now() }]; } catch { /* kept without the pair */ } }
        jobs[kind] = { ...j, status: 'done', at: now() };
        if (kind === 'review') { fields.stage = 'reviewed'; after.push('research', 'draw'); await awardXp(user.id, 'upload', 'vdi:' + row.id).catch(() => {}); }
        else after.push('research');
      } else if (kind === 'research') {
        const parsed = JSON.parse(outputText(data)), domains = await manufacturerDomains();
        const research = { ...verifySources(parsed, data, domains), at: now(), place: placeLine(row.jurisdiction) };
        fields.research = research;
        jobs[kind] = { ...j, status: 'done', at: now() };
        await cacheResearch(row, research);
      } else if (kind === 'draw') {
        const d = cleanDraw(JSON.parse(outputText(data)));
        if (d.drawing.elements.length < 3) throw new Error('the drawing came back empty');
        const validation = checkDrawing(d.drawing);
        const detail = await saveDetail(row, d, validation, j.r!, String(j.model || data?.model || ''), null);
        fields.drawing = { ...d, saved_detail: !!detail }; fields.validation = validation; fields.stage = 'ready';
        if (detail) fields.detail_id = detail.id;
        jobs[kind] = { ...j, status: 'done', at: now() };
      } else if (kind === 'image') {
        const img = (data?.output || []).find((o: any) => o?.type === 'image_generation_call' && o?.result);
        if (!img) throw new Error('no picture came back');
        const path = `${row.owner_id}/vdi/${row.id}/ai-3d-${Date.now().toString(36)}.png`;
        await storageUpload(PRIVATE_BUCKET, path, Uint8Array.from(Buffer.from(img.result, 'base64')), 'image/png');
        fields.ai_image_path = path; jobs[kind] = { ...j, status: 'done', at: now() };
      }
    } catch (e: any) {
      jobs[kind] = { ...j, status: 'failed', error: 'the answer came back unreadable: ' + (e?.message || e) };
      if (kind === 'review') { await refundOnce(user.id, j.access, 'vdi_review_refund', row.id); fields.stage = 'failed'; }
      else if (j.access) await refundOnce(user.id, j.access, `vdi_${kind}_refund`, j.r!);
    }
  }
  if (changed) row = (await patch(row.id, { ...fields, jobs })) || { ...row, ...fields, jobs };
  if (after.length) row = await startFollowOn(row!, [...new Set(after)]);
  return json(view(row!));
}

async function cacheResearch(row: Row, research: ReturnType<typeof verifySources>) {
  const j = row.jurisdiction || {}, key = placeLine(j) ? jurisdictionKey(j) : '';
  const adopt = research.adoption.codes.filter((c: any) => c.verified && c.source_url).map((c: any) => ({ jurisdiction_key: key, jurisdiction: placeLine(j), code: c.code, edition: c.edition || null, amendments: c.amendments || null, effective: c.effective || null, source_url: c.source_url, checked_at: now() }));
  if (key && adopt.length) await adminRest('vdi_code_adoptions?on_conflict=jurisdiction_key,code', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(adopt) }).catch(() => {});
  if (research.manufacturer_refs.length) {
    const src = await rows<{ id: string; domain: string; license_status: string }>('vdi_manufacturer_sources?approved=eq.true&select=id,domain,license_status');
    const classes = row.review?.assembly?.classes || [];
    const refs = research.manufacturer_refs.map((m: any) => {
      const h = new URL(m.url).hostname, s = src.find(x => h === x.domain || h.endsWith('.' + x.domain));
      return { source_id: s?.id || null, manufacturer: m.manufacturer, product: m.product || null, title: m.title, region: m.region || null, revision: m.revision || null, published: m.published || null, url: m.url, file_type: m.file_type || null, kind: m.kind, classes, search_text: [m.manufacturer, m.product, m.title, m.region, ...(row.review?.search_terms || [])].filter(Boolean).join(' '), license_status: s?.license_status || 'link_only', found_by: 'web_search', last_checked: now() };
    });
    await adminRest('vdi_manufacturer_refs?on_conflict=url', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(refs) }).catch(() => {});
  }
}

/** The corrected detail goes into details (source drawup_ai, private) so the v25.1 viewer, revisions, approval and set
 *  replacement all work on it. parent: the previous revision when the member saves vector edits or redraws. */
async function saveDetail(row: Row, d: ReturnType<typeof cleanDraw>, validation: any, responseId: string, model: string, parent: any) {
  const rv = row.review || {};
  const root = parent ? parent.root_id || parent.id : null;
  let revision = 0;
  if (root) { const top = (await rows(`details?or=(id.eq.${root},root_id.eq.${root})&select=revision&order=revision.desc&limit=1`))[0]; revision = Math.max(Number(parent.revision || 0), Number(top?.revision || 0)) + 1; }
  const sev = (p: string) => (p === 'high' ? 'critical' : p === 'medium' ? 'major' : 'minor');
  const flaws = (rv.findings || []).map((f: any) => ({ severity: sev(f.priority), flaw: `${f.item}: ${f.finding}`, why: f.explain?.why_it_matters || '', fix: f.recommendation, reference: '' }));
  const full = {
    owner_id: row.owner_id, title: d.title || rv.title || 'Corrected detail', category: d.category, description: d.summary || rv.assessment?.headline || null, material: d.material || null, assembly: d.assembly || rv.assembly?.type || null,
    visibility: 'private', status: 'published', source: 'drawup_ai', detail_code: parent?.detail_code || 'AI-' + responseId.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase(),
    drawing: d.drawing, review: { source_reading: d.source_reading, is_detail: d.is_detail, flaws: flaws.length ? flaws : d.flaws, general_notes: d.general_notes, assumptions: [...d.assumptions, ...d.assumed_dims.map((a: any) => `${a.what}: ${a.value} (assumed: ${a.why})`)], file_name: row.file_name || '', notes: row.notes || '', changes: d.diffs.map((x: any) => ({ comment: x.finding_id, what: x.change, done: true })), vdi_review_id: row.id, validation: { ok: validation.ok, issues: validation.issues.slice(0, 40) } },
    source_paths: row.source_paths || [], ai_response_id: responseId, ai_model: model, credits_charged: 0,
    root_id: root, parent_id: parent?.id || null, revision,
    detail_no: rv.sheet_ref?.detail_no || null, sheet_no: rv.sheet_ref?.sheet_no || null, sheet_ref: rv.sheet_ref?.detail_no && rv.sheet_ref?.sheet_no ? `${rv.sheet_ref.detail_no}-${rv.sheet_ref.sheet_no}`.toUpperCase().replace(/[^A-Z0-9.\-]/g, '') : null,
    project_name: rv.sheet_ref?.project_name || null, needs_more_info: false, info_requests: [], revise_comments: [],
  };
  let r = await adminRest('details', { method: 'POST', body: JSON.stringify(full) });
  let out = await r.json().catch(() => null);
  if (!r.ok && r.status !== 409 && /column|schema cache/i.test(String(out?.message || ''))) {
    const { root_id: _a, parent_id: _b, revision: _c, detail_no: _d, sheet_no: _e, sheet_ref: _f, project_name: _g, needs_more_info: _j, info_requests: _k, revise_comments: _l, ...base } = full;
    r = await adminRest('details', { method: 'POST', body: JSON.stringify(base) }); out = await r.json().catch(() => null);
  }
  if (r.ok) return Array.isArray(out) ? out[0] : out;
  if (r.status === 409) return (await rows(`details?ai_response_id=eq.${encodeURIComponent(responseId)}&owner_id=eq.${row.owner_id}&select=*&limit=1`))[0] || null;
  console.error('[drawup] vdi detail save failed', out);
  return null;
}

/* ------------------------------------------------------------------ follow-ups */
async function answer(user: { id: string; is_anonymous?: boolean }, id: string, text: unknown) {
  const a = str(text, 1200);
  if (a.length < 1) return json({ error: 'Type an answer.' }, 400);
  const row = await loadOwn(id, user.id);
  if (!row?.review) return json({ error: 'That review is not ready yet.' }, 404);
  if (['running', 'starting'].includes(row.jobs?.refine?.status || '')) return json({ error: 'DrawUp is still working on your last answer.' }, 409);
  const cost = price('DRAWUP_VDI_REFINE_COST', 3);
  const access = await reserveCredits(user, cost, 'vdi_refine');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  row.jobs = { ...row.jobs, refine: { status: 'starting', at: now(), access } };
  const ok = await startReview(row, 'refine', { question: row.review.followup?.question || 'Member note', answer: a });
  if (!ok.ok) { await refundOnce(user.id, access, 'vdi_refine_refund', id + ':' + Date.now()); return json({ error: ok.error + ' You were not charged.' }, 502); }
  return json({ status: 'running' });
}

async function place(user: { id: string; is_anonymous?: boolean }, id: string, b: any) {
  const row = await loadOwn(id, user.id);
  if (!row?.review) return json({ error: 'That review is not ready yet.' }, 404);
  const j = { city: str(b?.city, 80), state: str(b?.state, 80), country: str(b?.country, 80) || 'United States', permit: str(b?.permit, 200) };
  if (!j.city && !j.state) return json({ error: 'Add at least the state (and the city if it has local amendments).' }, 400);
  if (['running', 'starting'].includes(row.jobs?.research?.status || '')) return json({ error: 'DrawUp is still checking sources.' }, 409);
  if (!webSearchOn()) { await patch(id, { jurisdiction: j }); return json({ status: 'saved', note: 'Saved. Code checking with web search is turned off on this server.' }); }
  const cost = price('DRAWUP_VDI_REFINE_COST', 3);
  const access = await reserveCredits(user, cost, 'vdi_place');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  row.jurisdiction = j;
  const res = await startResearch(row);
  if (!res.ok) { await refundOnce(user.id, access, 'vdi_place_refund', id + ':' + Date.now()); return json({ error: res.error + ' You were not charged.' }, 502); }
  await patch(id, { jurisdiction: j, jobs: { ...row.jobs, research: { ...res.job!, access } } });
  return json({ status: 'running' });
}

async function redraw(user: { id: string; is_anonymous?: boolean }, id: string) {
  const row = await loadOwn(id, user.id);
  if (!row?.review) return json({ error: 'That review is not ready yet.' }, 404);
  const d = row.jobs?.draw;
  if (['running', 'starting'].includes(d?.status || '')) return json({ error: 'DrawUp is already drawing this detail.' }, 409);
  const free = d?.status === 'failed' && !d?.retried;
  const cost = free ? 0 : price('DRAWUP_VDI_REDRAW_COST', 10);
  const access = cost ? await reserveCredits(user, cost, 'vdi_redraw') : ({ ok: true, credits_charged: 0 } as CreditAccess);
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  const res = await startDraw(row);
  if (!res.ok) { if (cost) await refundOnce(user.id, access, 'vdi_redraw_refund', id + ':' + Date.now()); return json({ error: res.error + ' You were not charged.' }, 502); }
  await patch(id, { stage: 'drawing', jobs: { ...row.jobs, draw: { ...res.job!, access: cost ? access : undefined, retried: free || d?.retried } } });
  return json({ status: 'running', credits_charged: access.credits_charged ?? 0 });
}

/** The member's vector edits: re-cleaned, re-checked, and saved as the next revision of the corrected detail. */
async function saveEdit(user: { id: string }, id: string, drawing: any) {
  const row = await loadOwn(id, user.id);
  if (!row?.drawing) return json({ error: 'There is no corrected detail to edit yet.' }, 404);
  const prev = row.drawing;
  const d = cleanDraw({ ...prev, drawing: drawing, components: drawing?.components || prev.drawing?.components || [], assumed_dims: prev.assumed_dims || [], diffs: [...(prev.diffs || []).filter((x: any) => x.finding_id || !/^Edited by the member/.test(x.change)), { finding_id: '', change: 'Edited by the member in the DrawUp vector editor.' }] });
  if (d.drawing.elements.length < 1) return json({ error: 'The edited detail is empty.' }, 400);
  const validation = checkDrawing(d.drawing);
  const parent = row.detail_id ? (await rows(`details?id=eq.${row.detail_id}&owner_id=eq.${user.id}&select=id,root_id,revision,detail_code&limit=1`))[0] : null;
  const detail = await saveDetail(row, d, validation, 'edit-' + crypto.randomUUID(), 'member-edit', parent);
  const saved = await patch(id, { drawing: { ...d, saved_detail: !!detail, edited_at: now() }, validation, ...(detail ? { detail_id: detail.id } : {}) });
  return json({ ...(saved ? view(saved) : {}), detail, validation });
}

async function image(user: { id: string; is_anonymous?: boolean }, id: string) {
  if (process.env.DRAWUP_VDI_AI_IMAGE !== 'on') return json({ error: 'AI 3D illustrations are not turned on for this site yet.' }, 403);
  const row = await loadOwn(id, user.id);
  if (!row?.drawing) return json({ error: 'Make the corrected detail first.' }, 404);
  if (['running', 'starting'].includes(row.jobs?.image?.status || '')) return json({ error: 'The illustration is already being made.' }, 409);
  const cost = price('DRAWUP_VDI_IMAGE_COST', 8);
  const access = await reserveCredits(user, cost, 'vdi_image');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  const comps = (row.drawing?.drawing?.components || []).map((c: any) => `${c.name} (${c.material})`).join('; ');
  const prompt = `Clean architectural axonometric cutaway illustration of a construction assembly: ${row.drawing?.title || row.review?.title}. ` +
    `Layers from the building's interior to exterior and bottom to top as in the section: ${comps}. Realistic building materials, layers slightly separated to show ` +
    `installation order, thin cyan holographic edge highlights, dark navy background, soft controlled studio lighting, no text, no labels, no people, no logos.`;
  try {
    const made = await openaiBackground({ input: prompt, tools: [{ type: 'image_generation', size: '1536x1024', quality: 'medium' }], tool_choice: { type: 'image_generation' } }, models(process.env.DRAWUP_VDI_IMAGE_MODEL, 'gpt-5-mini', 'gpt-5'));
    await patch(id, { jobs: { ...row.jobs, image: { r: made.id, model: made.model, status: 'running', at: now(), access } } });
    return json({ status: 'running' });
  } catch (e: any) { await refundOnce(user.id, access, 'vdi_image_refund', id + ':' + Date.now()); return json({ error: (e?.message || 'The illustration could not start.') + ' You were not charged.' }, 502); }
}
