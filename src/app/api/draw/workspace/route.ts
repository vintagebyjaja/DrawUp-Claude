import { EDIT_INSTRUCTIONS, EDIT_SCHEMA, INTERPRET_INSTRUCTIONS, INTERPRET_SCHEMA, cleanEdit, cleanInterpretation } from '@/lib/drawup-draw-ws';
import { PRIVATE_BUCKET, creditMessage, missingConfig, models, openaiBackground, openaiGet, outputText, pathIsOwn, readTicket, refundCredits, refundOnce, reserveCredits, signTicket, signedInUser, storageSignedUrls, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V29 Draw Workspace 2.0. Same background pattern as Draw a detail: the page uploads the picture to drawup-private,
// the AI reads it through a short-lived link as a stored background response, and this route answers with a ticket.
//   interpret { path, image: {w, h}, hint?, kind? }      -> { status: 'running', ticket }
//   edit      { text, drawing (plain-text summary), selection? } -> { status: 'running', ticket }
//   poll      { poll: <ticket> } -> { status: 'running' } | { status: 'done', interpretation | edit } | { error, final: true }
// The AI only returns positions and operations. The page builds the geometry, shows a preview and saves nothing until
// the member confirms. Failed jobs are refunded once.
// Settings (optional): DRAWUP_DRAW_WS_MODEL (default gpt-5, then gpt-5-mini), DRAWUP_DRAW_WS_EFFORT (minimal | low | medium,
// default low), DRAWUP_DRAW_INTERPRET_COST (default 20 credits), DRAWUP_DRAW_EDIT_COST (default 2).

const TICKET_MAX_AGE_MS = 24 * 3600 * 1000;
const IMG_PATH_RE = /\.(png|jpe?g|webp)$/i;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const price = (name: string, d: number) => Math.max(0, Math.round(Number(process.env[name]) || d));
const str = (v: unknown, max: number) => String(v ?? '').slice(0, max).trim();
const effort = () => (['minimal', 'low', 'medium'].includes(String(process.env.DRAWUP_DRAW_WS_EFFORT)) ? process.env.DRAWUP_DRAW_WS_EFFORT : 'low');

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to use DrawUp AI in Draw.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'DrawUp AI is not connected yet: ' + notReady }, 503);
  if (Number(request.headers.get('content-length') || 0) > 1024 * 1024) return json({ error: 'That request is too large.' }, 413);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.poll === 'string') return poll(user, body.poll);
  if (body?.action === 'interpret') return interpret(user, body);
  if (body?.action === 'edit') return edit(user, body);
  return json({ error: 'Unknown Draw request.' }, 400);
}

async function interpret(user: { id: string; is_anonymous?: boolean }, body: any) {
  const path = String(body?.path || '');
  if (!pathIsOwn(path, user.id) || !IMG_PATH_RE.test(path)) return json({ error: 'Upload a JPG, PNG or WebP picture first (PDF pages are turned into a picture on your device).' }, 400);
  const W = Math.round(Number(body?.image?.w) || 0), H = Math.round(Number(body?.image?.h) || 0);
  if (!(W >= 64 && H >= 64 && W <= 8000 && H <= 8000)) return json({ error: 'The picture size is missing.' }, 400);
  let url: string | null = null;
  try { url = (await storageSignedUrls(PRIVATE_BUCKET, [path], 3600))[0]; } catch { url = null; }
  if (!url) return json({ error: 'Your uploaded picture could not be read. Try again.' }, 400);
  const cost = price('DRAWUP_DRAW_INTERPRET_COST', 20);
  const access: CreditAccess = await reserveCredits(user, cost, 'draw_interpret');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  const hint = str(body?.hint, 600), kind = str(body?.kind, 30);
  const content = [
    { type: 'input_text', text: `THE PICTURE is ${W} x ${H} pixels.${kind ? ' The member says it is: ' + kind + '.' : ''}${hint ? '\nMEMBER NOTES: ' + hint : ''}` },
    { type: 'input_image', image_url: url, detail: 'high' },
  ];
  const payload = { instructions: INTERPRET_INSTRUCTIONS, input: [{ role: 'user', content }], reasoning: { effort: effort() }, max_output_tokens: 24000, text: { format: { type: 'json_schema', name: 'drawup_interpretation', strict: true, schema: INTERPRET_SCHEMA } } };
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload, models(process.env.DRAWUP_DRAW_WS_MODEL, 'gpt-5', 'gpt-5-mini')); }
  catch (e: any) { await refundCredits(user.id, access, 'draw_interpret_refund'); return json({ error: (e?.message || 'DrawUp AI could not start.') + ' You were not charged.' }, 502); }
  const ticket = signTicket({ v: 1, k: 'draw_interpret', u: user.id, r: made.id, t: Date.now(), a: access, img: { w: W, h: H } });
  return json({ status: 'running', ticket, credits_charged: access.credits_charged ?? 0 });
}

async function edit(user: { id: string; is_anonymous?: boolean }, body: any) {
  const text = str(body?.text, 600), drawing = str(body?.drawing, 60000), selection = str(body?.selection, 200);
  if (text.length < 3) return json({ error: 'Say what to change, for example "move the counter 3 feet north".' }, 400);
  if (!drawing) return json({ error: 'Open a drawing first.' }, 400);
  const cost = price('DRAWUP_DRAW_EDIT_COST', 2);
  const access: CreditAccess = await reserveCredits(user, cost, 'draw_edit');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  const payload = { instructions: EDIT_INSTRUCTIONS, input: [{ role: 'user', content: [{ type: 'input_text', text: `${drawing}\n${selection ? 'SELECTION: ' + selection + '\n' : ''}REQUEST: ${text}` }] }], reasoning: { effort: 'low' }, max_output_tokens: 6000, text: { format: { type: 'json_schema', name: 'drawup_edit', strict: true, schema: EDIT_SCHEMA } } };
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload, models(process.env.DRAWUP_DRAW_WS_EDIT_MODEL, 'gpt-5-mini', 'gpt-5')); }
  catch (e: any) { await refundCredits(user.id, access, 'draw_edit_refund'); return json({ error: (e?.message || 'DrawUp AI could not start.') + ' You were not charged.' }, 502); }
  const ticket = signTicket({ v: 1, k: 'draw_edit', u: user.id, r: made.id, t: Date.now(), a: access });
  return json({ status: 'running', ticket, credits_charged: access.credits_charged ?? 0 });
}

async function poll(user: { id: string }, ticket: string) {
  const t = readTicket<any>(ticket);
  if (!t || t.v !== 1 || !['draw_interpret', 'draw_edit'].includes(t.k) || t.u !== user.id || !t.r) return json({ error: 'That Draw job is not yours.', final: true }, 403);
  if (Date.now() - Number(t.t || 0) > TICKET_MAX_AGE_MS) return json({ error: 'That Draw job expired. Start again.', final: true }, 410);
  let data: any;
  try { data = await openaiGet(t.r); } catch { return json({ status: 'running', retry: true }); }
  if (data?.status === 'queued' || data?.status === 'in_progress') return json({ status: 'running', elapsed: Math.round((Date.now() - Number(t.t)) / 1000) });
  const access = (t.a || {}) as CreditAccess;
  const what = t.k === 'draw_edit' ? 'The change could not be worked out' : 'The picture could not be read';
  const fail = async (why: string, status = 502) => { await refundOnce(user.id, access, t.k + '_refund', t.r); return json({ error: `${what}: ${why}. You were not charged.`, final: true }, status); };
  if (data?.status !== 'completed') return fail(data?.status === 'incomplete' ? 'the AI reached its output limit' : data?.error?.message || 'the AI job failed');
  let raw: any;
  try { raw = JSON.parse(outputText(data)); } catch { return fail('the answer came back unreadable'); }
  if (t.k === 'draw_edit') {
    const e = cleanEdit(raw);
    if (!e.ops.length && !e.clarify && !e.summary) return fail('no change came back');
    return json({ status: 'done', edit: e, credits_charged: access.credits_charged ?? 0 });
  }
  const I = cleanInterpretation(raw, t.img);
  if (!I.walls.length && !I.rooms.length && !I.components.length) return fail('no walls, rooms or furniture were found');
  return json({ status: 'done', interpretation: I, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
}
