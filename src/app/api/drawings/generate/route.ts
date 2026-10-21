import { awardXp } from '@/lib/drawup-coach-persona';
import { DRAWINGS_INSTRUCTIONS, DRAWINGS_SCHEMA, EXPLORE_NOTE, EXPLORE_SCHEMA, FULL_NOTE, PRELIMINARY_NOTE, REVISE_INSTRUCTIONS, cleanModel, detailKey } from '@/lib/drawup-drawings-core';
import { PRIVATE_BUCKET, adminRest, adminRpc, creditMessage, missingConfig, models, openaiGet, outputText, pathIsOwn, readTicket, refundCredits, refundOnce, reserveCredits, signTicket, openaiBackground, signedInUser, storageSignedUrls, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Draw it up": picture in, coordinated drawing set out. The AI returns one building model (schema in
// drawup-drawings-core.ts); the page draws every sheet from it and can combine them into one PDF set.
// V25.1 (Cloudflare CPU): the page sends { background: true }. The pictures go to OpenAI as short-lived signed links
// to the copies the page already uploaded to Supabase Storage (not as base64 in this request), the AI runs as a
// stored background response, and this route answers at once with a signed ticket. The page then polls
// { poll: <ticket> } every few seconds; each poll is one quick status read, and the poll that sees the finished
// answer saves the set (once: ai_response_id is unique, SQL v25.1-01). That keeps every request to a few
// milliseconds of Worker CPU; relaying the streamed answer used to take ~0.7 s of CPU per set.
// Requests without "background" still stream the answer back on the request (v25 behavior, for pages that loaded
// the older script), with progress lines sent at most twice a second.
// Kinds of request:
//   new set    { images, mode: 'preliminary' | 'full' | 'explore', notes, location, project_id, coach_thread_id }
//   revision   { revise_of: <set id>, comments: [{ id, text, sheet?, crop? }], notes }  (v25)
//   develop    { develop_from: <explore set id>, option: <index> }  (v25, no AI call, no credits)
//   poll       { poll: <ticket> }  (v25.1) -> { status: 'running' } | { status: 'done', model, generation, … } | { error }
// Pictures (v25.1): pictures: [{ path } | { image }] in order, path = the member's own Storage copy. A comment's
// picture can be crop_path instead of crop. The v25 fields (images, crop) still work.
// Every result is saved in drawing_generations (SQL v24-02 + v25 0065), and each detail the model says the set
// still needs is added to the shared Details library (detail_finds, source "drawings").
//
// Settings (optional): DRAWUP_DRAWINGS_MODEL (default gpt-5, then gpt-5-mini), DRAWUP_DRAWINGS_EFFORT
// (minimal | low | medium, default low), DRAWUP_DRAWINGS_COST (full set, default 40),
// DRAWUP_DRAWINGS_PRELIM_COST (default 20), DRAWUP_DRAWINGS_EXPLORE_COST (default 50),
// DRAWUP_DRAWINGS_REVISE_COST (default 25).

const OPENAI_KEY = () => process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MAX_IMAGES = 6;
const MAX_COMMENTS = 20;
const MAX_CROPS = 12;
const MAX_BODY_CHARS = 40 * 1024 * 1024;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const MODES = ['preliminary', 'full', 'explore'] as const;
type Mode = typeof MODES[number];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const cost = (name: string, d: number) => Math.max(0, Math.round(Number(process.env[name]) || d));

async function openStream(payload: Record<string, unknown>, list: string[]) {
  let last = 'The AI request failed.';
  for (const model of list) {
    for (const withHint of [true, false]) {
      const body: any = { ...payload, model, stream: true, store: false };
      if (!withHint) delete body.reasoning;
      const r = await fetch(OPENAI_BASE() + '/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY()}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
      });
      if (r.ok && r.body) return { res: r, model };
      const data = await r.json().catch(() => ({}));
      last = data?.error?.message || `The AI service returned ${r.status}.`;
      if (r.status === 400 && withHint && /reasoning|effort/i.test(last)) continue;
      if ([400, 404].includes(r.status) && /model/i.test(last)) break;
      throw new Error(last);
    }
  }
  throw new Error(last);
}

const TICKET_MAX_AGE_MS = 48 * 3600 * 1000;
const SIGNED_LINK_SECONDS = 3600;

/** Short-lived links to the member's own Storage pictures, in the same order (null where one could not be signed). */
async function signedLinks(paths: string[]): Promise<(string | null)[]> {
  if (!paths.length) return [];
  try { return await storageSignedUrls(PRIVATE_BUCKET, paths, SIGNED_LINK_SECONDS); }
  catch (e) { console.error('[drawup] signing picture links failed', e); return paths.map(() => null); }
}

/** v25.1: the member's own and the published AI-drawn catalog details (empty before SQL v25.1-02). */
async function catalogDetails(userId: string): Promise<any[]> {
  try {
    const r = await adminRest(`details?source=eq.drawup_ai&status=eq.published&or=(owner_id.eq.${userId},visibility.eq.drawup)&detail_code=not.is.null&select=detail_code,title,category&order=created_at.desc&limit=40`);
    return r.ok ? ((await r.json()) || []) : [];
  } catch { return []; }
}

/** Only rows the member owns may be linked. */
async function ownsRow(table: string, id: string, ownerCol: string, userId: string) {
  if (!UUID_RE.test(id)) return false;
  const r = await adminRest(`${table}?id=eq.${id}&${ownerCol}=eq.${userId}&select=id&limit=1`);
  return r.ok && ((await r.json()) || []).length > 0;
}
async function ownSet(id: string, userId: string) {
  if (!UUID_RE.test(id)) return null;
  const r = await adminRest(`drawing_generations?id=eq.${id}&owner_id=eq.${userId}&select=*&limit=1`);
  if (!r.ok) return null;
  return ((await r.json()) || [])[0] || null;
}
/** Saves a set. With ai_response_id (v25.1) a second save of the same AI answer returns the first row instead. */
async function insertSet(row: Record<string, unknown>): Promise<{ row: any; dupe?: boolean } | null> {
  try {
    const r = await adminRest('drawing_generations', { method: 'POST', body: JSON.stringify(row) });
    const out = await r.json().catch(() => null);
    if (r.ok) return { row: Array.isArray(out) ? out[0] : out };
    if (row.ai_response_id && r.status === 409) {
      const again = await adminRest(`drawing_generations?ai_response_id=eq.${encodeURIComponent(String(row.ai_response_id))}&owner_id=eq.${row.owner_id}&select=*&limit=1`);
      const found = again.ok ? ((await again.json()) || [])[0] : null;
      if (found) return { row: found, dupe: true };
    }
    // Before SQL v25.1-01 the column doesn't exist yet: save without it.
    if (row.ai_response_id && /ai_response_id/.test(JSON.stringify(out))) { const { ai_response_id: _r, ...rest } = row; return insertSet(rest); }
    console.error('[drawup] drawing_generations insert failed', out);
  } catch (e) { console.error('[drawup] drawing_generations insert failed', e); }
  return null;
}
/** The Details library grows from every set: each needed detail is recorded (de-duplicated by key). */
async function recordDetails(list: any[], userId: string, skip: Set<string> = new Set()) {
  for (const d of list || []) {
    const key = detailKey(d.title);
    if (!key || skip.has(key)) continue;
    try { await adminRpc('drawup_detail_find_note', { p_key: key, p_title: d.title, p_category: d.category, p_query: `${d.title}: ${d.why}`.slice(0, 400), p_source: 'drawings', p_user: userId }); }
    catch (e) { console.error('[drawup] detail note failed', e); }
  }
}

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to draw up a drawing set.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'Drawing generation is not connected yet: ' + notReady }, 503);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_CHARS) return json({ error: 'Those pictures are too large to send. Try fewer or smaller pictures.' }, 413);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.poll === 'string') return poll(user, body.poll);

  /* ---------------------------------------------------------------- develop an explored option (no AI) */
  if (body?.develop_from) {
    const src = await ownSet(String(body.develop_from), user.id);
    const opt = src?.options?.[Math.round(Number(body.option) || 0)];
    if (!src || !opt?.model) return json({ error: 'That option could not be found.' }, 404);
    const model = cleanModel(opt.model);
    const saved = await insertSet({ owner_id: user.id, project_thread_id: src.project_thread_id, coach_thread_id: src.coach_thread_id, title: model.title, model, mode: 'full',
      parent_id: src.id, source_paths: src.source_paths || [], notes: src.notes, location: src.location, details_needed: model.details_needed, next_steps: model.next_steps, credits_charged: 0, ai_model: src.ai_model });
    if (!saved) return json({ error: 'The set could not be saved. Run the v25 drawing revisions SQL in Supabase.' }, 500);
    await recordDetails(model.details_needed, user.id);
    return json({ model, generation: saved.row, saved: true, credits_charged: 0 });
  }

  /* ---------------------------------------------------------------- build the AI request */
  const revising = !!body?.revise_of;
  const background = body?.background === true;
  let parent: any = null, mode: Mode = MODES.includes(body?.mode) ? body.mode : 'full';
  const content: any[] = [];
  let instructions = DRAWINGS_INSTRUCTIONS, schema: unknown = DRAWINGS_SCHEMA, schemaName = 'drawup_building_model';
  let pictureCount = 0, sourcePaths: string[] = [], comments: any[] = [];
  const notes = String(body?.notes || '').slice(0, 3000);
  let location = String(body?.location || '').slice(0, 200);
  let project: string | null = null, coachThread: string | null = null;

  if (revising) {
    parent = await ownSet(String(body.revise_of), user.id);
    if (!parent) return json({ error: 'That drawing set could not be found.' }, 404);
    mode = parent.mode === 'preliminary' ? 'preliminary' : 'full';
    comments = (Array.isArray(body?.comments) ? body.comments : []).slice(0, MAX_COMMENTS).map((c: any, i: number) => ({
      n: i + 1, id: String(c?.id || '').slice(0, 40), text: String(c?.text || '').trim().slice(0, 1000), sheet: String(c?.sheet || '').slice(0, 8),
      crop: typeof c?.crop === 'string' && IMG_RE.test(c.crop) ? c.crop : '', crop_path: pathIsOwn(String(c?.crop_path || ''), user.id) ? String(c.crop_path) : '' })).filter((c: any) => c.text);
    if (!comments.length && !notes) return json({ error: 'Add at least one comment to regenerate.' }, 400);
    location = parent.location || location; project = parent.project_thread_id; coachThread = parent.coach_thread_id; sourcePaths = parent.source_paths || [];
    instructions = REVISE_INSTRUCTIONS + DRAWINGS_INSTRUCTIONS + '\n\n' + (mode === 'preliminary' ? PRELIMINARY_NOTE : FULL_NOTE);
    content.push({ type: 'input_text', text: 'PREVIOUS MODEL:\n' + JSON.stringify({ ...parent.model, changes: [] }) });
    const withCrop = comments.filter(c => c.crop || c.crop_path).slice(0, MAX_CROPS);
    const links = await signedLinks(withCrop.filter(c => !c.crop).map(c => c.crop_path));
    const cropOf = new Map<any, string>();
    let li = 0;
    for (const c of withCrop) { const url = c.crop || links[li++]; if (url) cropOf.set(c, url); }
    for (const c of comments) {
      content.push({ type: 'input_text', text: `COMMENT ${c.n}${c.sheet ? ` (pinned on sheet ${c.sheet})` : ' (general)'}: ${c.text}` });
      if (cropOf.has(c)) content.push({ type: 'input_image', image_url: cropOf.get(c), detail: 'high' });
    }
    if (notes) content.push({ type: 'input_text', text: 'GENERAL NOTES: ' + notes });
  } else {
    // v25.1: pictures: [{ path } | { image }]; v25: images: [dataUrl]
    const pics: { path?: string; image?: string }[] = Array.isArray(body?.pictures)
      ? body.pictures.map((p: any) => ({ path: typeof p?.path === 'string' ? p.path : undefined, image: typeof p?.image === 'string' ? p.image : undefined }))
      : (Array.isArray(body?.images) ? body.images : []).map((x: any) => ({ image: String(x) }));
    if (!pics.length) return json({ error: 'Add at least one picture.' }, 400);
    if (pics.length > MAX_IMAGES) return json({ error: `Use up to ${MAX_IMAGES} pictures or pages.` }, 400);
    if (pics.some(p => p.path ? !pathIsOwn(p.path, user.id) : !(p.image && IMG_RE.test(p.image)))) return json({ error: 'One of the pictures is not an image DrawUp can read.' }, 400);
    const links = await signedLinks(pics.filter(p => p.path).map(p => p.path!));
    if (links.some(l => !l)) return json({ error: 'One of your uploaded pictures could not be read. Try Draw it up again.' }, 400);
    let li = 0;
    const urls = pics.map(p => (p.path ? links[li++]! : p.image!));
    pictureCount = urls.length;
    sourcePaths = (Array.isArray(body?.source_paths) ? body.source_paths : []).map(String).filter((p: string) => pathIsOwn(p, user.id)).slice(0, MAX_IMAGES);
    const projectId = String(body?.project_id || ''), coachThreadId = String(body?.coach_thread_id || '');
    project = projectId && await ownsRow('project_threads', projectId, 'owner_id', user.id) ? projectId : null;
    coachThread = coachThreadId && await ownsRow('coach_threads', coachThreadId, 'owner_id', user.id) ? coachThreadId : null;
    urls.forEach((url: string, i: number) => content.push({ type: 'input_text', text: `PICTURE ${i + 1}` }, { type: 'input_image', image_url: url, detail: 'high' }));
    content.push({ type: 'input_text', text: [`USER NOTES: ${notes || '(none)'}`, `PROJECT LOCATION: ${location || '(not given; name the model code you assumed)'}`].join('\n') });
    if (mode === 'explore') { instructions = EXPLORE_NOTE + '\n\n' + DRAWINGS_INSTRUCTIONS; schema = EXPLORE_SCHEMA; schemaName = 'drawup_design_options'; }
    else instructions = DRAWINGS_INSTRUCTIONS + '\n\n' + (mode === 'preliminary' ? PRELIMINARY_NOTE : FULL_NOTE);
  }

  // v25.1: details already drawn in the Detail Catalog (AI-drawn from uploads) are offered to the model, so a set that
  // needs one names it by its catalog code (shown on the A5xx sheets and linked from the Draw it up page).
  const catalog = await catalogDetails(user.id);
  if (catalog.length) content.push({ type: 'input_text', text: 'DETAIL CATALOG (details already drawn in DrawUp). When a detail this set needs matches one of these, start that details_needed title with its code, for example "' + catalog[0].detail_code + ' ' + catalog[0].title + '":\n' + catalog.map((c: any) => `${c.detail_code} ${c.title} (${c.category})`).join('\n') });

  const price = revising ? cost('DRAWUP_DRAWINGS_REVISE_COST', 25) : mode === 'preliminary' ? cost('DRAWUP_DRAWINGS_PRELIM_COST', 20) : mode === 'explore' ? cost('DRAWUP_DRAWINGS_EXPLORE_COST', 50) : cost('DRAWUP_DRAWINGS_COST', 40);
  const action = revising ? 'drawing_set_revision' : 'drawing_set_generation';
  const access: CreditAccess = await reserveCredits(user, price, action);
  if (!access.ok) return json({ error: creditMessage(access, price), ...access }, 402);

  const effort = ['minimal', 'low', 'medium'].includes(String(process.env.DRAWUP_DRAWINGS_EFFORT)) ? process.env.DRAWUP_DRAWINGS_EFFORT : 'low';
  const payload = {
    instructions,
    input: [{ role: 'user', content }],
    reasoning: { effort },
    max_output_tokens: mode === 'explore' && !revising ? 40000 : 16000,
    text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
  };
  const job: Job = { mode, revising, parent, project, coachThread, sourcePaths, notes, location, comments: comments.map(({ crop: _c, crop_path: _p, ...c }) => c), access };

  /* ---------------------------------------------------------------- v25.1: background response + ticket */
  if (background) {
    let made: { id: string; model: string };
    try { made = await openaiBackground(payload, models(process.env.DRAWUP_DRAWINGS_MODEL, 'gpt-5', 'gpt-5-mini')); }
    catch (e: any) { await refundCredits(user.id, access, 'drawing_set_refund'); return json({ error: (e?.message || 'Drawing generation could not start.') + ' You were not charged.' }, 502); }
    const ticket = signTicket({ v: 1, u: user.id, r: made.id, ai: made.model, t: Date.now(), mode, rev: revising, p: parent?.id || null, pr: project, ct: coachThread, sp: sourcePaths, n: notes, l: location, c: job.comments, a: access });
    return json({ status: 'running', ticket, mode, revising, images: pictureCount, credits_charged: access.credits_charged ?? 0 });
  }

  /* ---------------------------------------------------------------- v25: stream the answer on this request */
  let started: { res: Response; model: string };
  try { started = await openStream(payload, models(process.env.DRAWUP_DRAWINGS_MODEL, 'gpt-5', 'gpt-5-mini')); }
  catch (e: any) { await refundCredits(user.id, access, 'drawing_set_refund'); return json({ error: (e?.message || 'Drawing generation could not start.') + ' You were not charged.' }, 502); }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      let open = true;
      const send = (o: unknown) => { if (!open) return; try { ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { open = false; } };
      const ping = setInterval(() => send({ t: 'ping' }), 8000);
      send({ t: 'start', images: pictureCount, mode, revising });
      let text = '', status = '', errMsg = '', lastProgress = 0;
      try {
        const reader = started.res.body!.getReader(), dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let cut: number;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, cut); buf = buf.slice(cut + 2);
            const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
            if (!data || data === '[DONE]') continue;
            let e: any; try { e = JSON.parse(data); } catch { continue; }
            if (e.type === 'response.output_text.delta') {
              text += e.delta || '';
              // V25.1: at most two progress lines a second (one per token cost ~0.1 ms of CPU each).
              const now = Date.now(); if (now - lastProgress > 500) { lastProgress = now; send({ t: 'progress', chars: text.length }); }
            }
            else if (e.type === 'response.completed') status = 'completed';
            else if (e.type === 'response.incomplete') { status = 'incomplete'; errMsg = 'the AI reached its output limit'; }
            else if (e.type === 'response.failed' || e.type === 'error') { status = 'failed'; errMsg = e.response?.error?.message || e.message || 'the AI job failed'; }
          }
        }
      } catch (e: any) { status = status || 'failed'; errMsg = errMsg || e?.message || 'the connection to the AI dropped'; }

      const out = status === 'completed' ? await finish(user.id, job, text, started.model, null) : { error: errMsg || 'no answer' };
      if ('error' in out) {
        await refundCredits(user.id, access, 'drawing_set_refund');
        send({ t: 'error', error: `The drawing set could not be made: ${out.error}. You were not charged.` });
      } else send({ t: 'done', ...out });
      clearInterval(ping);
      if (open) try { ctrl.close(); } catch { /* page already left */ }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}

/* ------------------------------------------------------------------ finishing a set (both paths) */
type Job = { mode: Mode; revising: boolean; parent: any; project: string | null; coachThread: string | null; sourcePaths: string[]; notes: string; location: string; comments: any[]; access: CreditAccess };

/** Reads the AI's answer and saves the set. Returns what the page needs, or { error }. Never refunds (the caller does). */
async function finish(userId: string, job: Job, text: string, aiModel: string, responseId: string | null): Promise<Record<string, any> | { error: string }> {
  const { mode, revising, parent, comments, access } = job;
  let model: any = null, options: any[] | null = null;
  try {
    const raw = JSON.parse(text);
    if (mode === 'explore' && !revising) {
      const list = (Array.isArray(raw?.options) ? raw.options : []).slice(0, 3).map((o: any) => ({ name: String(o?.name || 'Option').slice(0, 80), idea: String(o?.idea || '').slice(0, 800), model: cleanModel(o?.model) }));
      if (!list.length) return { error: 'no design options came back' };
      options = list; model = list[0].model;
    } else model = cleanModel(raw);
  } catch { return { error: 'the answer came back unreadable' }; }

  let revision = 0, rootId: string | null = null;
  if (parent) {
    rootId = parent.root_id || parent.id;
    const r = await adminRest(`drawing_generations?or=(id.eq.${rootId},root_id.eq.${rootId})&owner_id=eq.${userId}&select=revision&order=revision.desc&limit=1`).catch(() => null);
    const top = r?.ok ? ((await r.json()) || [])[0]?.revision ?? 0 : 0;
    revision = Math.max(Number(parent.revision) || 0, Number(top) || 0) + 1;
  }
  const saved = await insertSet({
    owner_id: userId, project_thread_id: job.project, coach_thread_id: job.coachThread, title: parent?.title || model.title, model, mode,
    parent_id: parent?.id || null, root_id: rootId, revision, comments, changes: model.changes, next_steps: model.next_steps, options,
    source_paths: job.sourcePaths, notes: job.notes || parent?.notes || null, location: job.location || null, details_needed: model.details_needed,
    issue_status: parent?.issue_status || 'Preliminary', reviewer: parent?.reviewer || null, license_no: parent?.license_no || null,
    credits_charged: access.credits_charged ?? 0, ai_model: aiModel, ...(responseId ? { ai_response_id: responseId } : {}),
  });
  const row = saved?.row || null;
  // A second poll of the same finished answer only reads back the saved set.
  if (row && !saved?.dupe) {
    if (parent && comments.length) {
      // The pins the member sent are marked as answered by this revision; other pins stay open.
      const sent = new Set(comments.map(c => c.id).filter(Boolean));
      const markups = (Array.isArray(parent.markups) ? parent.markups : []).map((m: any) => sent.has(String(m?.id)) ? { ...m, status: 'sent', revision_id: row.id } : m);
      await adminRest(`drawing_generations?id=eq.${parent.id}&owner_id=eq.${userId}`, { method: 'PATCH', body: JSON.stringify({ markups, updated_at: new Date().toISOString() }) }).catch(() => null);
    }
    if (mode !== 'explore') await recordDetails(model.details_needed, userId, new Set((parent?.details_needed || []).map((d: any) => detailKey(d.title))));
    await awardXp(userId, 'upload', 'drawings:' + (row.id || Date.now())).catch(() => {});
  }
  return { model: row?.model || model, options: row?.options ?? options, generation: row, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null, saved: !!row };
}

/** v25.1 poll: one status read of the background response; the poll that sees it finished saves the set. */
async function poll(user: { id: string }, ticket: string) {
  const t = readTicket<any>(ticket);
  if (!t || t.v !== 1 || t.u !== user.id || !t.r) return json({ error: 'That drawing job is not yours.', final: true }, 403);
  if (Date.now() - Number(t.t || 0) > TICKET_MAX_AGE_MS) return json({ error: 'That drawing job expired. Check Your drawing sets.', final: true }, 410);
  let data: any;
  try { data = await openaiGet(t.r); } catch { return json({ status: 'running', retry: true }); }
  const elapsed = Math.round((Date.now() - Number(t.t)) / 1000);
  if (data?.status === 'queued' || data?.status === 'in_progress') return json({ status: 'running', elapsed });
  const mode: Mode = MODES.includes(t.mode) ? t.mode : 'full';
  const access = (t.a || {}) as CreditAccess;
  const action = t.rev ? 'drawing_set_revision' : 'drawing_set_generation';
  if (data?.status !== 'completed') {
    await refundOnce(user.id, access, 'drawing_set_refund', t.r);
    const why = data?.status === 'incomplete' ? 'the AI reached its output limit' : data?.error?.message || (data?.status === 'cancelled' ? 'it was canceled' : 'the AI job failed');
    return json({ error: `The drawing set could not be made: ${why}. You were not charged.`, final: true }, 502);
  }
  const parent = t.p ? await ownSet(String(t.p), user.id) : null;
  if (t.rev && !parent) { await refundOnce(user.id, access, 'drawing_set_refund', t.r); return json({ error: 'The drawing set this revises could not be found. You were not charged.', final: true }, 404); }
  const out = await finish(user.id, { mode, revising: !!t.rev, parent, project: t.pr || null, coachThread: t.ct || null, sourcePaths: t.sp || [], notes: t.n || '', location: t.l || '', comments: t.c || [], access }, outputText(data), String(t.ai || data?.model || ''), t.r);
  if ('error' in out) {
    await refundOnce(user.id, access, 'drawing_set_refund', t.r);
    return json({ error: `The drawing set could not be made: ${out.error}. You were not charged.`, final: true, action }, 502);
  }
  return json({ status: 'done', ...out });
}
