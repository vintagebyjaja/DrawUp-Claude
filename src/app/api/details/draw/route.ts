import { awardXp } from '@/lib/drawup-coach-persona';
import { ASK_INSTRUCTIONS, ASK_SCHEMA, DETAIL_INSTRUCTIONS, DETAIL_SCHEMA, REVISE_INSTRUCTIONS, cleanAsk, cleanDetail, sheetRefOf } from '@/lib/drawup-detail-draw';
import { PRIVATE_BUCKET, adminRest, creditMessage, missingConfig, models, openaiBackground, openaiGet, outputText, pathIsOwn, readTicket, refundCredits, refundOnce, reserveCredits, signTicket, signedInUser, storageSignedUrls, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V25.1 "Draw a detail" (Details tab): one uploaded detail in, the flaws with their fixes and reasons, and one clean
// detail drawing out, saved to the Detail Catalog (details.source = 'drawup_ai', SQL v25.1-02).
// Same background pattern as Draw it up (Cloudflare CPU): the page uploads the pictures to drawup-private, the AI gets
// short-lived links to them and runs as a stored background response, and this route answers with a signed ticket.
//   start    { pictures: [{ path, label? } | { image }], notes, file_name, share, sheet?, source_set? }  -> { status: 'running', ticket }
//   revise   the same + { parent_id, comments: [{ n, text, x?, y? }] }: the next revision of that detail (SQL v25.1-03)
//   poll     { poll: <ticket> }  -> { status: 'running' } | { status: 'done', detail | answer } | { error, final: true }
//   approve  { approve: <details id> } / { unapprove: <details id> }: marks that revision approved and puts it in its
//            Draw it up set slot (drawing_generations.detail_overrides); nothing else in the set changes
//   ask      { ask: <details id>, question }: the AI team answers about this detail (background, same ticket polling)
// Settings (optional): DRAWUP_DETAIL_MODEL (default gpt-5, then gpt-5-mini), DRAWUP_DETAIL_EFFORT (minimal | low |
// medium, default low), DRAWUP_DETAIL_DRAW_COST (default 15 credits), DRAWUP_DETAIL_REVISE_COST (default 10),
// DRAWUP_DETAIL_ASK_COST (default 1), DRAWUP_DETAIL_ASK_MODEL (default gpt-5-mini).

const MAX_PICTURES = 4;
const MAX_COMMENTS = 20;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT_RE = /^[0-9]{1,2}\/A5[0-9]{2}$/;
const TICKET_MAX_AGE_MS = 48 * 3600 * 1000;
const ACTION = 'detail_draw';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const price = (name: string, d: number) => Math.max(0, Math.round(Number(process.env[name]) || d));
const str = (v: unknown, max: number) => String(v ?? '').slice(0, max).trim();
const effort = () => (['minimal', 'low', 'medium'].includes(String(process.env.DRAWUP_DETAIL_EFFORT)) ? process.env.DRAWUP_DETAIL_EFFORT : 'low');

async function rows<T = any>(query: string): Promise<T[]> {
  const r = await adminRest(query);
  return r.ok ? ((await r.json()) || []) : [];
}
/** A detail this member may build on: their own, or a published catalog detail. */
async function visibleDetail(id: string, userId: string) {
  if (!UUID_RE.test(id)) return null;
  const d = (await rows(`details?id=eq.${id}&select=*&limit=1`))[0];
  if (!d || d.source !== 'drawup_ai' || !d.drawing) return null;
  return d.owner_id === userId || (d.visibility === 'drawup' && d.status === 'published') ? d : null;
}
function cleanSheet(v: any) {
  return { detail_no: str(v?.detail_no, 12), sheet_no: str(v?.sheet_no, 16), project_name: str(v?.project_name, 120), revision: str(v?.revision, 20), date: str(v?.date, 30) };
}
function cleanSourceSet(v: any, userId: string) {
  if (v?.kind === 'drawup' && UUID_RE.test(String(v.set_id)) && SLOT_RE.test(String(v.slot))) return { kind: 'drawup', set_id: String(v.set_id), slot: String(v.slot), title: str(v.title, 120) };
  if (v?.kind === 'pdf' && pathIsOwn(String(v.path || ''), userId) && /\.pdf$/i.test(String(v.path))) {
    const rect = (Array.isArray(v.rect) ? v.rect : []).slice(0, 4).map((x: any) => Math.min(1, Math.max(0, Number(x) || 0)));
    if (rect.length !== 4 || rect[2] <= rect[0] || rect[3] <= rect[1]) return null;
    // pdf_rect: the same box in the PDF's own coordinates (points), where the approved detail is drawn back in.
    const pdfRect = (Array.isArray(v.pdf_rect) ? v.pdf_rect : []).slice(0, 4).map((x: any) => Math.round(Math.min(1e5, Math.max(-1e5, Number(x) || 0)) * 100) / 100);
    return { kind: 'pdf', path: String(v.path), page: Math.max(1, Math.round(Number(v.page) || 1)), pages: Math.max(1, Math.round(Number(v.pages) || 1)), rect, pdf_rect: pdfRect.length === 4 && pdfRect[2] > pdfRect[0] && pdfRect[3] > pdfRect[1] ? pdfRect : null, rotate: [0, 90, 180, 270].includes(Number(v.rotate)) ? Number(v.rotate) : 0, file_name: str(v.file_name, 160) };
  }
  return null;
}

/** Saves the detail once per AI answer (ai_response_id is unique). Returns the row, or null if it could not be saved. */
async function saveDetail(row: Record<string, unknown>) {
  let r = await adminRest('details', { method: 'POST', body: JSON.stringify(row) });
  let out = await r.json().catch(() => null);
  // Before SQL v25.1-03 the revision / sheet columns do not exist: save the detail without them.
  if (!r.ok && r.status !== 409 && /column|schema cache/i.test(String(out?.message || ''))) {
    const { root_id: _a, parent_id: _b, revision: _c, detail_no: _d, sheet_no: _e, sheet_ref: _f, project_name: _g, rev_label: _h, drawing_date: _i, needs_more_info: _j, info_requests: _k, revise_comments: _l, source_set: _m, ...base } = row;
    r = await adminRest('details', { method: 'POST', body: JSON.stringify(base) });
    out = await r.json().catch(() => null);
  }
  if (r.ok) return { row: Array.isArray(out) ? out[0] : out, dupe: false };
  if (r.status === 409) {
    const found = (await rows(`details?ai_response_id=eq.${encodeURIComponent(String(row.ai_response_id))}&owner_id=eq.${row.owner_id}&select=*&limit=1`))[0];
    if (found) return { row: found, dupe: true };
  }
  console.error('[drawup] detail save failed', out);
  return null;
}

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to draw a detail.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'Detail drawing is not connected yet: ' + notReady }, 503);
  if (Number(request.headers.get('content-length') || 0) > 12 * 1024 * 1024) return json({ error: 'That file is too large to send. Try a smaller picture or fewer pages.' }, 413);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.poll === 'string') return poll(user, body.poll);
  if (typeof body?.approve === 'string' || typeof body?.unapprove === 'string') return approve(user, String(body.approve || body.unapprove), typeof body.approve === 'string');
  if (typeof body?.ask === 'string') return ask(user, body.ask, body.question);

  const parent = body?.parent_id ? await visibleDetail(String(body.parent_id), user.id) : null;
  if (body?.parent_id && !parent) return json({ error: 'That detail could not be found. Open it from the Detail Catalog and try again.' }, 404);
  const comments = (Array.isArray(body?.comments) ? body.comments : []).slice(0, MAX_COMMENTS)
    .map((c: any, i: number) => ({ n: str(c?.n, 8) || String(i + 1), text: str(c?.text, 800), x: Number.isFinite(Number(c?.x)) && c?.x !== null && c?.x !== '' ? Math.round(Number(c.x) * 100) / 100 : null, y: Number.isFinite(Number(c?.y)) && c?.y !== null && c?.y !== '' ? Math.round(Number(c.y) * 100) / 100 : null }))
    .filter((c: any) => c.text);

  const pics: { path?: string; image?: string; label: string }[] = (Array.isArray(body?.pictures) ? body.pictures : []).map((p: any) => ({ path: typeof p?.path === 'string' ? p.path : undefined, image: typeof p?.image === 'string' ? p.image : undefined, label: str(p?.label, 80) }));
  const notes = str(body?.notes, 2000);
  if (!pics.length && !parent && notes.length < 15) return json({ error: 'Add a picture or PDF of the detail, or describe it in a sentence or two.' }, 400);
  if (parent && !pics.length && !comments.length) return json({ error: 'Add a comment or a picture so DrawUp knows what to change.' }, 400);
  if (pics.length > MAX_PICTURES) return json({ error: `Use up to ${MAX_PICTURES} pictures or pages for one detail.` }, 400);
  if (pics.some(p => (p.path ? !pathIsOwn(p.path, user.id) : !(p.image && IMG_RE.test(p.image))))) return json({ error: 'One of the pictures is not an image DrawUp can read.' }, 400);
  const paths = pics.filter(p => p.path).map(p => p.path!);
  // On a revision the AI sees the original upload again (up to 2 pictures), signed for the parent's owner folder.
  const parentPaths: string[] = parent ? (parent.source_paths || []).filter((p: string) => typeof p === 'string' && !p.includes('..')).slice(0, 2) : [];
  let links: (string | null)[] = [];
  try { links = await storageSignedUrls(PRIVATE_BUCKET, [...paths, ...parentPaths], 3600); } catch { links = [...paths, ...parentPaths].map(() => null); }
  if (links.slice(0, paths.length).some(l => !l)) return json({ error: 'Your uploaded picture could not be read. Try again.' }, 400);
  let li = 0;
  const urls = pics.map(p => ({ url: p.path ? links[li++]! : p.image!, label: p.label }));
  const parentUrls = links.slice(paths.length).filter(Boolean) as string[];
  const fileName = str(body?.file_name, 160);
  const share = body?.share !== false;
  const sheet = cleanSheet(body?.sheet);
  const sourceSet = cleanSourceSet(body?.source_set, user.id) || (parent?.source_set && parent.owner_id === user.id ? parent.source_set : null);

  const cost = parent ? price('DRAWUP_DETAIL_REVISE_COST', 10) : price('DRAWUP_DETAIL_DRAW_COST', 15);
  const access: CreditAccess = await reserveCredits(user, cost, ACTION);
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);

  const content: any[] = [];
  parentUrls.forEach((url, i) => content.push({ type: 'input_text', text: `ORIGINAL UPLOAD${parentUrls.length > 1 ? ' ' + (i + 1) : ''}` }, { type: 'input_image', image_url: url, detail: 'high' }));
  urls.forEach((u, i) => content.push({ type: 'input_text', text: u.label ? u.label.toUpperCase() : parent ? `NEW PICTURE ${i + 1}` : urls.length > 1 ? `PAGE ${i + 1}` : 'THE UPLOADED DETAIL' }, { type: 'input_image', image_url: u.url, detail: 'high' }));
  const setLine = Object.values(sheet).some(Boolean) ? `SET REFERENCE (from the member): detail ${sheet.detail_no || '?'} on sheet ${sheet.sheet_no || '?'}, project ${sheet.project_name || '?'}, revision ${sheet.revision || '?'}, date ${sheet.date || '?'}` : '';
  content.push({ type: 'input_text', text: [`MEMBER NOTES: ${notes || '(none)'}`, fileName ? `FILE NAME: ${fileName}` : '', setLine, !pics.length && !parent ? 'NO PICTURE: draw this detail from the notes.' : ''].filter(Boolean).join('\n') });
  if (parent) {
    const prev = { title: parent.title, category: parent.category, view: parent.drawing?.view, drawing: parent.drawing, flaws: parent.review?.flaws || [], info_requests: parent.info_requests || [] };
    content.push({ type: 'input_text', text: 'PREVIOUS DETAIL (revision ' + (parent.revision || 0) + '):\n' + JSON.stringify(prev).slice(0, 120000) });
    content.push({ type: 'input_text', text: 'COMMENTS:\n' + (comments.map((c: any) => `${c.n}. ${c.text}${c.x != null && c.y != null ? ` (AT x=${c.x}, y=${c.y})` : ''}`).join('\n') || '(none: use the new pictures to make the detail more accurate)') });
  }
  const payload = {
    instructions: DETAIL_INSTRUCTIONS + (parent ? REVISE_INSTRUCTIONS : ''),
    input: [{ role: 'user', content }],
    reasoning: { effort: effort() },
    max_output_tokens: 16000,
    text: { format: { type: 'json_schema', name: 'drawup_detail', strict: true, schema: DETAIL_SCHEMA } },
  };
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload, models(process.env.DRAWUP_DETAIL_MODEL, 'gpt-5', 'gpt-5-mini')); }
  catch (e: any) { await refundCredits(user.id, access, 'detail_draw_refund'); return json({ error: (e?.message || 'Detail drawing could not start.') + ' You were not charged.' }, 502); }
  const ticket = signTicket({
    v: 1, k: 'detail', u: user.id, r: made.id, ai: made.model, t: Date.now(), sp: paths, n: notes, f: fileName, sh: share, a: access,
    p: parent ? parent.id : null, c: comments, s: sheet, ss: sourceSet,
  });
  return json({ status: 'running', ticket, credits_charged: access.credits_charged ?? 0 });
}

async function poll(user: { id: string }, ticket: string) {
  const t = readTicket<any>(ticket);
  if (!t || t.v !== 1 || !['detail', 'ask'].includes(t.k) || t.u !== user.id || !t.r) return json({ error: 'That detail job is not yours.', final: true }, 403);
  if (Date.now() - Number(t.t || 0) > TICKET_MAX_AGE_MS) return json({ error: 'That detail job expired. Check your details in the catalog.', final: true }, 410);
  let data: any;
  try { data = await openaiGet(t.r); } catch { return json({ status: 'running', retry: true }); }
  if (data?.status === 'queued' || data?.status === 'in_progress') return json({ status: 'running', elapsed: Math.round((Date.now() - Number(t.t)) / 1000) });
  const access = (t.a || {}) as CreditAccess;
  const what = t.k === 'ask' ? 'The team could not answer' : 'The detail could not be drawn';
  const fail = async (why: string, status = 502) => { await refundOnce(user.id, access, t.k === 'ask' ? 'detail_ask_refund' : 'detail_draw_refund', t.r); return json({ error: `${what}: ${why}. You were not charged.`, final: true }, status); };
  if (data?.status !== 'completed') return fail(data?.status === 'incomplete' ? 'the AI reached its output limit' : data?.error?.message || 'the AI job failed');
  if (t.k === 'ask') return saveAnswer(user, t, data, access, fail);

  let d: ReturnType<typeof cleanDetail>;
  try { d = cleanDetail(JSON.parse(outputText(data))); } catch { return fail('the answer came back unreadable'); }
  if (d.drawing.elements.length < 3) return fail('the drawing came back empty');

  const parent = t.p ? (await rows(`details?id=eq.${t.p}&select=id,root_id,revision,detail_code,detail_no,sheet_no,project_name,rev_label,drawing_date,source_set,owner_id,visibility&limit=1`))[0] : null;
  const root = parent ? parent.root_id || parent.id : null;
  let revision = 0;
  if (root) {
    const top = (await rows(`details?or=(id.eq.${root},root_id.eq.${root})&select=revision&order=revision.desc&limit=1`))[0];
    revision = Math.max(Number(parent.revision || 0), Number(top?.revision || 0)) + 1;
  }
  const sheet = t.s || {};
  const pickRef = (k: 'detail_no' | 'sheet_no' | 'project_name') => sheet[k] || parent?.[k] || d.sheet_ref[k] || '';
  const detailNo = pickRef('detail_no'), sheetNo = pickRef('sheet_no');
  const code = parent?.detail_code || 'AI-' + t.r.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase();
  const saved = await saveDetail({
    owner_id: user.id, title: d.title, category: d.category, description: d.summary || null, material: d.material || null, assembly: d.assembly || null,
    visibility: parent ? (parent.owner_id === user.id ? parent.visibility : 'private') : t.sh ? 'drawup' : 'private', status: 'published', source: 'drawup_ai', detail_code: code,
    drawing: d.drawing, review: { source_reading: d.source_reading, is_detail: d.is_detail, flaws: d.flaws, general_notes: d.general_notes, assumptions: d.assumptions, file_name: t.f || '', notes: t.n || '', changes: d.changes },
    source_paths: [...(t.sp || [])], ai_response_id: t.r, ai_model: String(t.ai || data?.model || ''), credits_charged: access.credits_charged ?? 0,
    root_id: root, parent_id: parent?.id || null, revision,
    detail_no: detailNo || null, sheet_no: sheetNo || null, sheet_ref: sheetRefOf(detailNo, sheetNo) || null, project_name: pickRef('project_name') || null,
    rev_label: sheet.revision || d.sheet_ref.revision || parent?.rev_label || null, drawing_date: sheet.date || d.sheet_ref.date || parent?.drawing_date || null,
    needs_more_info: d.needs_more_info, info_requests: d.info_requests, revise_comments: t.c || [],
    source_set: t.ss || null,
  });
  if (!saved) return fail('it could not be saved (run the v25.1 SQL in Supabase)', 500);
  // A revision keeps the original upload's pictures so the next revision can look at them again.
  if (!saved.dupe && parent && !(t.sp || []).length && parent.owner_id === user.id) {
    const src = (await rows(`details?id=eq.${parent.id}&select=source_paths&limit=1`))[0]?.source_paths || [];
    if (src.length) await adminRest(`details?id=eq.${saved.row.id}`, { method: 'PATCH', body: JSON.stringify({ source_paths: src }) }).then(async r => { if (r.ok) saved.row.source_paths = src; }).catch(() => {});
  }
  if (!saved.dupe) await awardXp(user.id, 'upload', 'detail:' + saved.row.id).catch(() => {});
  return json({ status: 'done', detail: saved.row, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
}

/** Approve (or take back) one revision. A Draw it up set gets that one slot pointed at it; nothing else is touched. */
async function approve(user: { id: string }, id: string, on: boolean) {
  if (!UUID_RE.test(id)) return json({ error: 'Pick a detail to approve.' }, 400);
  const d = (await rows(`details?id=eq.${id}&owner_id=eq.${user.id}&select=id,root_id,revision,source,source_set,detail_code,title&limit=1`))[0];
  if (!d || d.source !== 'drawup_ai') return json({ error: 'Only the member who drew this detail can approve it.' }, 403);
  const root = d.root_id || d.id, now = new Date().toISOString();
  // One approved revision per detail: approving this one takes the approval off the others.
  if (on) {
    const r = await adminRest(`details?or=(id.eq.${root},root_id.eq.${root})&owner_id=eq.${user.id}&approved_at=not.is.null&id=neq.${d.id}`, { method: 'PATCH', body: JSON.stringify({ approved_at: null, approved_by: null }) });
    if (!r.ok && /column|schema cache/i.test(await r.text())) return json({ error: 'Run the v25.1-03 SQL in Supabase to approve details.' }, 500);
  }
  const r = await adminRest(`details?id=eq.${d.id}`, { method: 'PATCH', body: JSON.stringify({ approved_at: on ? now : null, approved_by: on ? user.id : null }) });
  if (!r.ok) return json({ error: /column|schema cache/i.test(await r.text()) ? 'Run the v25.1-03 SQL in Supabase to approve details.' : 'The approval could not be saved.' }, 500);
  let set: any = null;
  const ss = d.source_set;
  if (ss?.kind === 'drawup' && UUID_RE.test(String(ss.set_id)) && SLOT_RE.test(String(ss.slot))) {
    const g = (await rows(`drawing_generations?id=eq.${ss.set_id}&owner_id=eq.${user.id}&select=id,detail_overrides&limit=1`))[0];
    if (g) {
      const map = { ...(g.detail_overrides || {}) };
      if (on) map[ss.slot] = { id: d.id, code: d.detail_code, revision: d.revision || 0, title: d.title, slot_title: ss.title || '', at: now };
      else if (map[ss.slot]?.id === d.id) delete map[ss.slot];
      const u = await adminRest(`drawing_generations?id=eq.${g.id}&owner_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ detail_overrides: map }) });
      set = u.ok ? { id: g.id, slot: ss.slot, detail_overrides: map } : { error: 'The set could not be updated (run the v25.1-03 SQL).' };
    } else set = { error: 'That drawing set is no longer in your account.' };
  }
  return json({ ok: true, approved_at: on ? now : null, set });
}

async function ask(user: { id: string }, id: string, question: unknown) {
  const q = str(question, 1500);
  if (q.length < 3) return json({ error: 'Type a question for the team.' }, 400);
  const d = await visibleDetail(id, user.id);
  if (!d) return json({ error: 'That detail could not be found.' }, 404);
  const earlier = await rows(`detail_team_answers?detail_id=eq.${d.id}&user_id=eq.${user.id}&select=question,answer,speaker&order=created_at.desc&limit=6`);
  const cost = price('DRAWUP_DETAIL_ASK_COST', 1);
  const access: CreditAccess = await reserveCredits(user, cost, 'detail_ask');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  const context = { title: d.title, category: d.category, material: d.material, assembly: d.assembly, sheet_ref: d.sheet_ref, revision: d.revision || 0, summary: d.description, drawing: d.drawing, flaws: d.review?.flaws || [], general_notes: d.review?.general_notes || [], assumptions: d.review?.assumptions || [], member_notes: d.review?.notes || '' };
  const payload = {
    instructions: ASK_INSTRUCTIONS,
    input: [{ role: 'user', content: [
      { type: 'input_text', text: 'THE DETAIL:\n' + JSON.stringify(context).slice(0, 100000) },
      { type: 'input_text', text: 'EARLIER QUESTIONS:\n' + (earlier.reverse().map(e => `Q: ${e.question}\n${e.speaker}: ${e.answer}`).join('\n\n') || '(none)') },
      { type: 'input_text', text: 'QUESTION: ' + q },
    ] }],
    reasoning: { effort: 'low' },
    max_output_tokens: 4000,
    text: { format: { type: 'json_schema', name: 'drawup_detail_answer', strict: true, schema: ASK_SCHEMA } },
  };
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload, models(process.env.DRAWUP_DETAIL_ASK_MODEL, 'gpt-5-mini', 'gpt-5')); }
  catch (e: any) { await refundCredits(user.id, access, 'detail_ask_refund'); return json({ error: (e?.message || 'The team could not be reached.') + ' You were not charged.' }, 502); }
  return json({ status: 'running', ticket: signTicket({ v: 1, k: 'ask', u: user.id, r: made.id, ai: made.model, t: Date.now(), d: d.id, q, a: access }) });
}

async function saveAnswer(user: { id: string }, t: any, data: any, access: CreditAccess, fail: (why: string, status?: number) => Promise<Response>) {
  let a: ReturnType<typeof cleanAsk>;
  try { a = cleanAsk(JSON.parse(outputText(data))); } catch { return fail('the answer came back unreadable'); }
  const row = { detail_id: t.d, user_id: user.id, question: t.q, answer: a.answer, verdict: a.verdict, suggestions: a.suggestions, info_requests: a.info_requests, speaker: a.speaker, credits_charged: access.credits_charged ?? 0, ai_response_id: t.r };
  const r = await adminRest('detail_team_answers', { method: 'POST', body: JSON.stringify(row) });
  let saved = r.ok ? ((await r.json().catch(() => null)) || [])[0] : null;
  if (!r.ok && r.status === 409) saved = (await rows(`detail_team_answers?ai_response_id=eq.${encodeURIComponent(t.r)}&select=*&limit=1`))[0];
  // Without SQL v25.1-03 the answer is still shown, just not kept.
  return json({ status: 'done', answer: saved || { ...row, id: null, created_at: new Date().toISOString() }, saved: !!saved, credits_charged: access.credits_charged ?? 0 });
}
