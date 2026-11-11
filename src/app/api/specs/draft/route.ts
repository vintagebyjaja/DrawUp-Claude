import { DRAFT_INSTRUCTIONS, DRAFT_SCHEMA, cleanDraft, draftInput } from '@/lib/drawup-spec-draft';
import { creditMessage, missingConfig, models, openaiBackground, openaiGet, outputText, readTicket, refundCredits, refundOnce, reserveCredits, signTicket, signedInUser, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// v30 AI specification drafting. Same background pattern as Draw Workspace:
//   draft { request, values, existing, outline, focus? } -> { status: 'running', ticket }
//   poll  { poll: <ticket> } -> { status: 'running' } | { status: 'done', draft } | { error, final: true }
// The answer is cleaned by cleanDraft (no brands, no code citations, unknown values become blanks) and returned to the
// page; nothing is saved until the member adds it to the manual. Failed jobs are refunded once.
// Settings (optional): DRAWUP_SPEC_MODEL (default gpt-5, then gpt-5-mini), DRAWUP_SPEC_DRAFT_COST (default 10 credits).

const TICKET_MAX_AGE_MS = 24 * 3600 * 1000;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const price = (name: string, d: number) => Math.max(0, Math.round(Number(process.env[name]) || d));

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to draft specifications with DrawUp AI.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'DrawUp AI is not connected yet: ' + notReady }, 503);
  if (Number(request.headers.get('content-length') || 0) > 512 * 1024) return json({ error: 'That request is too large.' }, 413);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.poll === 'string') return poll(user, body.poll);
  if (body?.action === 'draft') return draft(user, body);
  return json({ error: 'Unknown specification request.' }, 400);
}

async function draft(user: { id: string; is_anonymous?: boolean }, body: any) {
  const req = String(body?.request || '').trim();
  if (req.length < 6) return json({ error: 'Say what to draft, for example "the TPO roofing section".' }, 400);
  const values = body?.values && typeof body.values === 'object' ? body.values : {};
  const existing = Array.isArray(body?.existing) ? body.existing.map((s: any) => ({ number: String(s?.number || ''), title: String(s?.title || '') })) : [];
  const focus = body?.focus && typeof body.focus === 'object' ? { number: String(body.focus.number || ''), title: String(body.focus.title || ''), text: String(body.focus.text || '') } : null;
  const cost = price('DRAWUP_SPEC_DRAFT_COST', 10);
  const access: CreditAccess = await reserveCredits(user, cost, 'spec_draft');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  const payload = {
    instructions: DRAFT_INSTRUCTIONS,
    input: [{ role: 'user', content: [{ type: 'input_text', text: draftInput({ request: req, values, existing, outline: !!body?.outline, focus }) }] }],
    reasoning: { effort: 'low' }, max_output_tokens: 16000,
    text: { format: { type: 'json_schema', name: 'drawup_spec_draft', strict: true, schema: DRAFT_SCHEMA } },
  };
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload, models(process.env.DRAWUP_SPEC_MODEL, 'gpt-5', 'gpt-5-mini')); }
  catch (e: any) { await refundCredits(user.id, access, 'spec_draft_refund'); return json({ error: (e?.message || 'DrawUp AI could not start.') + ' You were not charged.' }, 502); }
  const ticket = signTicket({ v: 1, k: 'spec_draft', u: user.id, r: made.id, m: made.model, t: Date.now(), a: access });
  return json({ status: 'running', ticket, credits_charged: access.credits_charged ?? 0 });
}

async function poll(user: { id: string }, ticket: string) {
  const t = readTicket<any>(ticket);
  if (!t || t.v !== 1 || t.k !== 'spec_draft' || t.u !== user.id || !t.r) return json({ error: 'That draft is not yours.', final: true }, 403);
  if (Date.now() - Number(t.t || 0) > TICKET_MAX_AGE_MS) return json({ error: 'That draft expired. Ask again.', final: true }, 410);
  let data: any;
  try { data = await openaiGet(t.r); } catch { return json({ status: 'running', retry: true }); }
  if (data?.status === 'queued' || data?.status === 'in_progress') return json({ status: 'running', elapsed: Math.round((Date.now() - Number(t.t)) / 1000) });
  const access = (t.a || {}) as CreditAccess;
  const fail = async (why: string) => { await refundOnce(user.id, access, 'spec_draft_refund', t.r); return json({ error: `The draft could not be written: ${why}. You were not charged.`, final: true }, 502); };
  if (data?.status !== 'completed') return fail(data?.status === 'incomplete' ? 'the AI reached its output limit' : data?.error?.message || 'the AI job failed');
  let raw: any;
  try { raw = JSON.parse(outputText(data)); } catch { return fail('the answer came back unreadable'); }
  const d = cleanDraft(raw);
  if (!d.sections.length && !d.reply && !d.questions.length) return fail('nothing came back');
  return json({ status: 'done', draft: { ...d, model: String(data?.model || t.m || ''), at: new Date().toISOString() }, credits_charged: access.credits_charged ?? 0 });
}
