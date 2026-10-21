import { awardXp } from '@/lib/drawup-coach-persona';
import { DRAWINGS_INSTRUCTIONS, DRAWINGS_SCHEMA, EXPLORE_NOTE, EXPLORE_SCHEMA, FULL_NOTE, PRELIMINARY_NOTE, REVISE_INSTRUCTIONS, cleanModel, detailKey } from '@/lib/drawup-drawings-core';
import { adminRest, adminRpc, creditMessage, missingConfig, models, pathIsOwn, refundCredits, reserveCredits, signedInUser, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "Draw it up": picture in, coordinated drawing set out. The AI returns one building model (schema in
// drawup-drawings-core.ts); the page draws every sheet from it and can combine them into one PDF set.
// The answer streams back on this request (same pattern as Quick Check), so there is no queue or polling.
// Three kinds of request share this route:
//   new set    { images, mode: 'preliminary' | 'full' | 'explore', notes, location, project_id, coach_thread_id }
//   revision   { revise_of: <set id>, comments: [{ id, text, sheet?, crop? }], notes }  (v25)
//   develop    { develop_from: <explore set id>, option: <index> }  (v25, no AI call, no credits)
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
async function insertSet(row: Record<string, unknown>) {
  try {
    const r = await adminRest('drawing_generations', { method: 'POST', body: JSON.stringify(row) });
    const out = await r.json().catch(() => null);
    if (r.ok) return Array.isArray(out) ? out[0] : out;
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
    return json({ model, generation: saved, saved: true, credits_charged: 0 });
  }

  /* ---------------------------------------------------------------- build the AI request */
  const revising = !!body?.revise_of;
  let parent: any = null, mode: Mode = MODES.includes(body?.mode) ? body.mode : 'full';
  const content: any[] = [];
  let instructions = DRAWINGS_INSTRUCTIONS, schema: unknown = DRAWINGS_SCHEMA, schemaName = 'drawup_building_model';
  let images: string[] = [], sourcePaths: string[] = [], comments: any[] = [];
  const notes = String(body?.notes || '').slice(0, 3000);
  let location = String(body?.location || '').slice(0, 200);
  let project: string | null = null, coachThread: string | null = null;

  if (revising) {
    parent = await ownSet(String(body.revise_of), user.id);
    if (!parent) return json({ error: 'That drawing set could not be found.' }, 404);
    mode = parent.mode === 'preliminary' ? 'preliminary' : 'full';
    comments = (Array.isArray(body?.comments) ? body.comments : []).slice(0, MAX_COMMENTS).map((c: any, i: number) => ({
      n: i + 1, id: String(c?.id || '').slice(0, 40), text: String(c?.text || '').trim().slice(0, 1000), sheet: String(c?.sheet || '').slice(0, 8),
      crop: typeof c?.crop === 'string' && IMG_RE.test(c.crop) ? c.crop : '' })).filter((c: any) => c.text);
    if (!comments.length && !notes) return json({ error: 'Add at least one comment to regenerate.' }, 400);
    location = parent.location || location; project = parent.project_thread_id; coachThread = parent.coach_thread_id; sourcePaths = parent.source_paths || [];
    instructions = REVISE_INSTRUCTIONS + DRAWINGS_INSTRUCTIONS + '\n\n' + (mode === 'preliminary' ? PRELIMINARY_NOTE : FULL_NOTE);
    content.push({ type: 'input_text', text: 'PREVIOUS MODEL:\n' + JSON.stringify({ ...parent.model, changes: [] }) });
    let crops = 0;
    for (const c of comments) {
      content.push({ type: 'input_text', text: `COMMENT ${c.n}${c.sheet ? ` (pinned on sheet ${c.sheet})` : ' (general)'}: ${c.text}` });
      if (c.crop && crops < MAX_CROPS) { crops++; content.push({ type: 'input_image', image_url: c.crop, detail: 'high' }); }
    }
    if (notes) content.push({ type: 'input_text', text: 'GENERAL NOTES: ' + notes });
  } else {
    images = (Array.isArray(body?.images) ? body.images : []).map(String);
    if (!images.length) return json({ error: 'Add at least one picture.' }, 400);
    if (images.length > MAX_IMAGES) return json({ error: `Use up to ${MAX_IMAGES} pictures or pages.` }, 400);
    if (images.some((x: string) => !IMG_RE.test(x))) return json({ error: 'One of the pictures is not an image DrawUp can read.' }, 400);
    sourcePaths = (Array.isArray(body?.source_paths) ? body.source_paths : []).map(String).filter((p: string) => pathIsOwn(p, user.id)).slice(0, MAX_IMAGES);
    const projectId = String(body?.project_id || ''), coachThreadId = String(body?.coach_thread_id || '');
    project = projectId && await ownsRow('project_threads', projectId, 'owner_id', user.id) ? projectId : null;
    coachThread = coachThreadId && await ownsRow('coach_threads', coachThreadId, 'owner_id', user.id) ? coachThreadId : null;
    images.forEach((img: string, i: number) => content.push({ type: 'input_text', text: `PICTURE ${i + 1}` }, { type: 'input_image', image_url: img, detail: 'high' }));
    content.push({ type: 'input_text', text: [`USER NOTES: ${notes || '(none)'}`, `PROJECT LOCATION: ${location || '(not given; name the model code you assumed)'}`].join('\n') });
    if (mode === 'explore') { instructions = EXPLORE_NOTE + '\n\n' + DRAWINGS_INSTRUCTIONS; schema = EXPLORE_SCHEMA; schemaName = 'drawup_design_options'; }
    else instructions = DRAWINGS_INSTRUCTIONS + '\n\n' + (mode === 'preliminary' ? PRELIMINARY_NOTE : FULL_NOTE);
  }

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

  let started: { res: Response; model: string };
  try { started = await openStream(payload, models(process.env.DRAWUP_DRAWINGS_MODEL, 'gpt-5', 'gpt-5-mini')); }
  catch (e: any) { await refundCredits(user.id, access, 'drawing_set_refund'); return json({ error: (e?.message || 'Drawing generation could not start.') + ' You were not charged.' }, 502); }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      let open = true;
      const send = (o: unknown) => { if (!open) return; try { ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { open = false; } };
      const ping = setInterval(() => send({ t: 'ping' }), 8000);
      send({ t: 'start', images: images.length, mode, revising });
      let text = '', status = '', errMsg = '';
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
            if (e.type === 'response.output_text.delta') { text += e.delta || ''; send({ t: 'progress', chars: text.length }); }
            else if (e.type === 'response.completed') status = 'completed';
            else if (e.type === 'response.incomplete') { status = 'incomplete'; errMsg = 'the AI reached its output limit'; }
            else if (e.type === 'response.failed' || e.type === 'error') { status = 'failed'; errMsg = e.response?.error?.message || e.message || 'the AI job failed'; }
          }
        }
      } catch (e: any) { status = status || 'failed'; errMsg = errMsg || e?.message || 'the connection to the AI dropped'; }

      let model: any = null, options: any[] | null = null;
      if (status === 'completed') {
        try {
          const raw = JSON.parse(text);
          if (mode === 'explore' && !revising) {
            const list = (Array.isArray(raw?.options) ? raw.options : []).slice(0, 3).map((o: any) => ({ name: String(o?.name || 'Option').slice(0, 80), idea: String(o?.idea || '').slice(0, 800), model: cleanModel(o?.model) }));
            if (list.length) { options = list; model = list[0].model; } else errMsg = 'no design options came back';
          } else model = cleanModel(raw);
        } catch { errMsg = 'the answer came back unreadable'; }
      }
      if (!model) {
        await refundCredits(user.id, access, 'drawing_set_refund');
        send({ t: 'error', error: `The drawing set could not be made: ${errMsg || 'no answer'}. You were not charged.` });
      } else {
        let revision = 0, rootId: string | null = null;
        if (parent) {
          rootId = parent.root_id || parent.id;
          const r = await adminRest(`drawing_generations?or=(id.eq.${rootId},root_id.eq.${rootId})&owner_id=eq.${user.id}&select=revision&order=revision.desc&limit=1`).catch(() => null);
          const top = r?.ok ? ((await r.json()) || [])[0]?.revision ?? 0 : 0;
          revision = Math.max(Number(parent.revision) || 0, Number(top) || 0) + 1;
        }
        const saved = await insertSet({
          owner_id: user.id, project_thread_id: project, coach_thread_id: coachThread, title: parent?.title || model.title, model, mode,
          parent_id: parent?.id || null, root_id: rootId, revision, comments: comments.map(({ crop: _crop, ...c }) => c), changes: model.changes, next_steps: model.next_steps, options,
          source_paths: sourcePaths, notes: notes || parent?.notes || null, location: location || null, details_needed: model.details_needed,
          issue_status: parent?.issue_status || 'Preliminary', reviewer: parent?.reviewer || null, license_no: parent?.license_no || null,
          credits_charged: access.credits_charged ?? 0, ai_model: started.model,
        });
        if (parent && saved && comments.length) {
          // The pins the member sent are marked as answered by this revision; other pins stay open.
          const sent = new Set(comments.map(c => c.id).filter(Boolean));
          const markups = (Array.isArray(parent.markups) ? parent.markups : []).map((m: any) => sent.has(String(m?.id)) ? { ...m, status: 'sent', revision_id: saved.id } : m);
          await adminRest(`drawing_generations?id=eq.${parent.id}&owner_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ markups, updated_at: new Date().toISOString() }) }).catch(() => null);
        }
        if (mode !== 'explore') await recordDetails(model.details_needed, user.id, new Set((parent?.details_needed || []).map((d: any) => detailKey(d.title))));
        await awardXp(user.id, 'upload', 'drawings:' + (saved?.id || Date.now())).catch(() => {});
        send({ t: 'done', model, options, generation: saved, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null, saved: !!saved });
      }
      clearInterval(ping);
      if (open) try { ctrl.close(); } catch { /* page already left */ }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}
