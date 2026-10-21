import { awardXp } from '@/lib/drawup-coach-persona';
import { DETAIL_INSTRUCTIONS, DETAIL_SCHEMA, cleanDetail } from '@/lib/drawup-detail-draw';
import { PRIVATE_BUCKET, adminRest, creditMessage, missingConfig, models, openaiBackground, openaiGet, outputText, pathIsOwn, readTicket, refundCredits, refundOnce, reserveCredits, signTicket, signedInUser, storageSignedUrls, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V25.1 "Draw a detail" (Details tab): one uploaded detail in, the flaws with their fixes and reasons, and one clean
// detail drawing out, saved to the Detail Catalog (details.source = 'drawup_ai', SQL v25.1-02).
// Same background pattern as Draw it up (Cloudflare CPU): the page uploads the pictures to drawup-private, the AI gets
// short-lived links to them and runs as a stored background response, and this route answers with a signed ticket.
//   start  { pictures: [{ path } | { image }], notes, file_name, share }  -> { status: 'running', ticket }
//   poll   { poll: <ticket> }  -> { status: 'running' } | { status: 'done', detail } | { error, final: true }
// Settings (optional): DRAWUP_DETAIL_MODEL (default gpt-5, then gpt-5-mini), DRAWUP_DETAIL_EFFORT (minimal | low |
// medium, default low), DRAWUP_DETAIL_DRAW_COST (default 15 credits).

const MAX_PICTURES = 4;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const TICKET_MAX_AGE_MS = 48 * 3600 * 1000;
const ACTION = 'detail_draw';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const cost = () => Math.max(0, Math.round(Number(process.env.DRAWUP_DETAIL_DRAW_COST) || 15));

/** Saves the detail once per AI answer (ai_response_id is unique). Returns the row, or null if it could not be saved. */
async function saveDetail(row: Record<string, unknown>) {
  const r = await adminRest('details', { method: 'POST', body: JSON.stringify(row) });
  const out = await r.json().catch(() => null);
  if (r.ok) return { row: Array.isArray(out) ? out[0] : out, dupe: false };
  if (r.status === 409) {
    const again = await adminRest(`details?ai_response_id=eq.${encodeURIComponent(String(row.ai_response_id))}&owner_id=eq.${row.owner_id}&select=*&limit=1`);
    const found = again.ok ? ((await again.json()) || [])[0] : null;
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

  const pics: { path?: string; image?: string }[] = (Array.isArray(body?.pictures) ? body.pictures : []).map((p: any) => ({ path: typeof p?.path === 'string' ? p.path : undefined, image: typeof p?.image === 'string' ? p.image : undefined }));
  if (!pics.length) return json({ error: 'Add a picture or PDF of the detail.' }, 400);
  if (pics.length > MAX_PICTURES) return json({ error: `Use up to ${MAX_PICTURES} pictures or pages for one detail.` }, 400);
  if (pics.some(p => (p.path ? !pathIsOwn(p.path, user.id) : !(p.image && IMG_RE.test(p.image))))) return json({ error: 'One of the pictures is not an image DrawUp can read.' }, 400);
  const paths = pics.filter(p => p.path).map(p => p.path!);
  let links: (string | null)[] = [];
  try { links = await storageSignedUrls(PRIVATE_BUCKET, paths, 3600); } catch { links = paths.map(() => null); }
  if (links.some(l => !l)) return json({ error: 'Your uploaded picture could not be read. Try again.' }, 400);
  let li = 0;
  const urls = pics.map(p => (p.path ? links[li++]! : p.image!));
  const notes = String(body?.notes || '').slice(0, 2000);
  const fileName = String(body?.file_name || '').slice(0, 160);
  const share = body?.share !== false;

  const price = cost();
  const access: CreditAccess = await reserveCredits(user, price, ACTION);
  if (!access.ok) return json({ error: creditMessage(access, price), ...access }, 402);

  const content: any[] = [];
  urls.forEach((url, i) => content.push({ type: 'input_text', text: urls.length > 1 ? `PAGE ${i + 1}` : 'THE UPLOADED DETAIL' }, { type: 'input_image', image_url: url, detail: 'high' }));
  content.push({ type: 'input_text', text: [`MEMBER NOTES: ${notes || '(none)'}`, fileName ? `FILE NAME: ${fileName}` : ''].filter(Boolean).join('\n') });
  const effort = ['minimal', 'low', 'medium'].includes(String(process.env.DRAWUP_DETAIL_EFFORT)) ? process.env.DRAWUP_DETAIL_EFFORT : 'low';
  const payload = {
    instructions: DETAIL_INSTRUCTIONS,
    input: [{ role: 'user', content }],
    reasoning: { effort },
    max_output_tokens: 16000,
    text: { format: { type: 'json_schema', name: 'drawup_detail', strict: true, schema: DETAIL_SCHEMA } },
  };
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload, models(process.env.DRAWUP_DETAIL_MODEL, 'gpt-5', 'gpt-5-mini')); }
  catch (e: any) { await refundCredits(user.id, access, 'detail_draw_refund'); return json({ error: (e?.message || 'Detail drawing could not start.') + ' You were not charged.' }, 502); }
  const ticket = signTicket({ v: 1, k: 'detail', u: user.id, r: made.id, ai: made.model, t: Date.now(), sp: paths, n: notes, f: fileName, sh: share, a: access });
  return json({ status: 'running', ticket, credits_charged: access.credits_charged ?? 0 });
}

async function poll(user: { id: string }, ticket: string) {
  const t = readTicket<any>(ticket);
  if (!t || t.v !== 1 || t.k !== 'detail' || t.u !== user.id || !t.r) return json({ error: 'That detail job is not yours.', final: true }, 403);
  if (Date.now() - Number(t.t || 0) > TICKET_MAX_AGE_MS) return json({ error: 'That detail job expired. Check your details in the catalog.', final: true }, 410);
  let data: any;
  try { data = await openaiGet(t.r); } catch { return json({ status: 'running', retry: true }); }
  if (data?.status === 'queued' || data?.status === 'in_progress') return json({ status: 'running', elapsed: Math.round((Date.now() - Number(t.t)) / 1000) });
  const access = (t.a || {}) as CreditAccess;
  const fail = async (why: string, status = 502) => { await refundOnce(user.id, access, 'detail_draw_refund', t.r); return json({ error: `The detail could not be drawn: ${why}. You were not charged.`, final: true }, status); };
  if (data?.status !== 'completed') return fail(data?.status === 'incomplete' ? 'the AI reached its output limit' : data?.error?.message || 'the AI job failed');
  let d: ReturnType<typeof cleanDetail>;
  try { d = cleanDetail(JSON.parse(outputText(data))); } catch { return fail('the answer came back unreadable'); }
  if (d.drawing.elements.length < 3) return fail('the drawing came back empty');

  const code = 'AI-' + t.r.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase();
  const saved = await saveDetail({
    owner_id: user.id, title: d.title, category: d.category, description: d.summary || null, material: d.material || null, assembly: d.assembly || null,
    visibility: t.sh ? 'drawup' : 'private', status: 'published', source: 'drawup_ai', detail_code: code,
    drawing: d.drawing, review: { source_reading: d.source_reading, is_detail: d.is_detail, flaws: d.flaws, general_notes: d.general_notes, assumptions: d.assumptions, file_name: t.f || '', notes: t.n || '' },
    source_paths: t.sp || [], ai_response_id: t.r, ai_model: String(t.ai || data?.model || ''), credits_charged: access.credits_charged ?? 0,
  });
  if (!saved) return fail('it could not be saved (run the v25.1 SQL in Supabase)', 500);
  if (!saved.dupe) await awardXp(user.id, 'upload', 'detail:' + saved.row.id).catch(() => {});
  return json({ status: 'done', detail: saved.row, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
}
