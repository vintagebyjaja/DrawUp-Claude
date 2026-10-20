import { awardXp } from '@/lib/drawup-coach-persona';
import { DRAWINGS_INSTRUCTIONS, DRAWINGS_SCHEMA, cleanModel, detailKey } from '@/lib/drawup-drawings-core';
import { adminRest, adminRpc, creditMessage, missingConfig, models, pathIsOwn, refundCredits, reserveCredits, signedInUser, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V24 "Draw it up": picture in, coordinated drawing set out. The AI returns one building model (schema in
// drawup-drawings-core.ts); the page draws every sheet from it and can combine them into one PDF set.
// The answer streams back on this request (same pattern as Quick Check), so there is no queue or polling.
// The result is saved in drawing_generations (SQL v24-02), and each detail the model says the set still needs
// is added to the shared Details library (detail_finds, source "drawings").
//
// Settings (optional): DRAWUP_DRAWINGS_MODEL (default gpt-5, then gpt-5-mini), DRAWUP_DRAWINGS_EFFORT
// (minimal | low | medium, default low), DRAWUP_DRAWINGS_COST (default 40 credits).

const OPENAI_KEY = () => process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MAX_IMAGES = 6;
const MAX_BODY_CHARS = 40 * 1024 * 1024;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

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

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to draw up a drawing set.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'Drawing generation is not connected yet: ' + notReady }, 503);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_CHARS) return json({ error: 'Those pictures are too large to send. Try fewer or smaller pictures.' }, 413);

  const body = await request.json().catch(() => ({}));
  const images = (Array.isArray(body?.images) ? body.images : []).map(String);
  if (!images.length) return json({ error: 'Add at least one picture.' }, 400);
  if (images.length > MAX_IMAGES) return json({ error: `Use up to ${MAX_IMAGES} pictures or pages.` }, 400);
  if (images.some((x: string) => !IMG_RE.test(x))) return json({ error: 'One of the pictures is not an image DrawUp can read.' }, 400);
  const sourcePaths = (Array.isArray(body?.source_paths) ? body.source_paths : []).map(String).filter((p: string) => pathIsOwn(p, user.id)).slice(0, MAX_IMAGES);
  const notes = String(body?.notes || '').slice(0, 3000);
  const location = String(body?.location || '').slice(0, 200);
  const projectId = String(body?.project_id || ''), coachThreadId = String(body?.coach_thread_id || '');
  const project = projectId && await ownsRow('project_threads', projectId, 'owner_id', user.id) ? projectId : null;
  const coachThread = coachThreadId && await ownsRow('coach_threads', coachThreadId, 'owner_id', user.id) ? coachThreadId : null;

  const cost = Math.max(0, Math.round(Number(process.env.DRAWUP_DRAWINGS_COST) || 40));
  const action = 'drawing_set_generation';
  const access: CreditAccess = await reserveCredits(user, cost, action);
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);

  const content: any[] = [];
  images.forEach((img: string, i: number) => content.push({ type: 'input_text', text: `PICTURE ${i + 1}` }, { type: 'input_image', image_url: img, detail: 'high' }));
  content.push({ type: 'input_text', text: [`USER NOTES: ${notes || '(none)'}`, `PROJECT LOCATION: ${location || '(not given; name the model code you assumed)'}`].join('\n') });
  const effort = ['minimal', 'low', 'medium'].includes(String(process.env.DRAWUP_DRAWINGS_EFFORT)) ? process.env.DRAWUP_DRAWINGS_EFFORT : 'low';
  const payload = {
    instructions: DRAWINGS_INSTRUCTIONS,
    input: [{ role: 'user', content }],
    reasoning: { effort },
    max_output_tokens: 16000,
    text: { format: { type: 'json_schema', name: 'drawup_building_model', strict: true, schema: DRAWINGS_SCHEMA } },
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
      send({ t: 'start', images: images.length });
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

      let model: any = null;
      if (status === 'completed') { try { model = cleanModel(JSON.parse(text)); } catch { errMsg = 'the answer came back unreadable'; } }
      if (!model) {
        await refundCredits(user.id, access, 'drawing_set_refund');
        send({ t: 'error', error: `The drawing set could not be made: ${errMsg || 'no answer'}. You were not charged.` });
      } else {
        let saved: any = null;
        try {
          const r = await adminRest('drawing_generations', { method: 'POST', body: JSON.stringify({
            owner_id: user.id, project_thread_id: project, coach_thread_id: coachThread, title: model.title, model,
            source_paths: sourcePaths, notes: notes || null, location: location || null, details_needed: model.details_needed,
            credits_charged: access.credits_charged ?? 0, ai_model: started.model,
          }) });
          const out = await r.json().catch(() => null);
          if (r.ok) saved = Array.isArray(out) ? out[0] : out;
          else console.error('[drawup] drawing_generations insert failed', out);
        } catch (e) { console.error('[drawup] drawing_generations insert failed', e); }
        // The Details library grows from every set: each needed detail is recorded (de-duplicated by key).
        for (const d of model.details_needed) {
          const key = detailKey(d.title);
          if (!key) continue;
          try { await adminRpc('drawup_detail_find_note', { p_key: key, p_title: d.title, p_category: d.category, p_query: `${d.title}: ${d.why}`.slice(0, 400), p_source: 'drawings', p_user: user.id }); }
          catch (e) { console.error('[drawup] detail note failed', e); }
        }
        await awardXp(user.id, 'upload', 'drawings:' + (saved?.id || Date.now())).catch(() => {});
        send({ t: 'done', model, generation: saved, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null, saved: !!saved });
      }
      clearInterval(ping);
      if (open) try { ctrl.close(); } catch { /* page already left */ }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}
