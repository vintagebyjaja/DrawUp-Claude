import { awardXp } from '@/lib/drawup-coach-persona';
import { QUICK_INSTRUCTIONS, QUICK_SCHEMA, normFindings, parseReport } from '@/lib/drawup-check-core';
import {
  adminSelectOne, adminUpdate, creditMessage, missingConfig, models, pathIsOwn, refundCredits, reserveCredits,
  signedInUser, type CreditAccess,
} from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V23 DrawUp Quick Check: upload an image, PNG or PDF set, get what is wrong explained, and see the fix drawn
// on the member's chosen sheet template. The page renders each page to an image itself (and close-up quarters
// for small sets), so the AI reads exactly what DrawUp will draw on. The answer streams straight back on this
// request: no background queue and no polling, which is what made a 3-page check sit for minutes before
// writing anything. The row is the same check_reviews row as a full check (mode "plans"), so the result also
// opens later from "Your checks". If the page closes mid-answer, /api/check marks the row failed and refunds
// it after 15 minutes.
//
// Settings (optional): DRAWUP_CHECK_QUICK_MODEL (default gpt-5-mini, then gpt-5), DRAWUP_CHECK_QUICK_EFFORT
// (minimal | low | medium, default low).

const OPENAI_KEY = () => process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MAX_PAGES = 12;
const MAX_BODY_CHARS = 60 * 1024 * 1024;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const priceFor = (pages: number) => (pages > 10 ? { action: 'large_document_analysis', cost: 150 } : { action: 'plan_analysis', cost: 30 });

/** Page text the browser extracted with pdf.js (same shape as /api/check). */
function textLayer(raw: any, maxChars = 30000) {
  if (!Array.isArray(raw) || !raw.length) return '';
  let s = 'TEXT LAYER (text printed on each page, extracted from the PDF by DrawUp; copy anchors from it exactly):\n';
  for (const p of raw.slice(0, MAX_PAGES)) {
    const n = Number(p?.page), t = String(p?.text || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
    if (!(n > 0) || !t) continue;
    if (s.length + t.length > maxChars) { s += '[text layer truncated]\n'; break; }
    s += `--- PAGE ${n} ---\n${t}\n`;
  }
  return s;
}

type Page = { page: number; image: string; tiles: { label: string; image: string }[] };
function cleanPages(raw: any): Page[] | string {
  if (!Array.isArray(raw) || !raw.length) return 'Add at least one page.';
  if (raw.length > MAX_PAGES) return `Quick check reads up to ${MAX_PAGES} pages. Use the full check for bigger sets.`;
  const out: Page[] = [];
  for (const [i, p] of raw.entries()) {
    const image = String(p?.image || '');
    if (!IMG_RE.test(image)) return `Page ${i + 1} is not an image DrawUp can read.`;
    const tiles = (Array.isArray(p?.tiles) ? p.tiles : []).slice(0, 4)
      .filter((t: any) => IMG_RE.test(String(t?.image || '')))
      .map((t: any) => ({ label: String(t.label || '').replace(/[^\w -]/g, '').slice(0, 30), image: String(t.image) }));
    out.push({ page: i + 1, image, tiles });
  }
  return out;
}

/** Starts the streamed answer, trying each model. Retries once without the reasoning hint if a model rejects it. */
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

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user) return json({ error: 'Sign in to use DrawUp Check.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'DrawUp Check is not connected yet: ' + notReady }, 503);
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_CHARS) return json({ error: 'Those pages are too large to send. Try fewer pages.' }, 413);

  const body = await request.json().catch(() => ({}));
  const id = String(body?.review_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Review not found.' }, 404);
  const review = await adminSelectOne<any>('check_reviews', `id=eq.${id}&select=*`);
  if (!review || review.owner_id !== user.id) return json({ error: 'Review not found.' }, 404);
  if (review.status !== 'queued' || (review.mode && review.mode !== 'plans')) return json({ error: 'This check has already started.', review }, 409);
  if (!pathIsOwn(review.file_path, user.id)) return json({ error: 'That file is not yours.' }, 403);
  const pages = cleanPages(body?.pages);
  if (typeof pages === 'string') return json({ error: pages }, 400);

  const template = body?.template && typeof body.template === 'object'
    ? { id: String(body.template.id || '').slice(0, 40), name: String(body.template.name || '').slice(0, 80) } : null;
  const { action, cost } = priceFor(pages.length);
  // Claim the row first so a double click can never start (or charge) two checks.
  const claimed = await adminUpdate('check_reviews', review.id, { status: 'reviewing', started_at: new Date().toISOString() }, 'status=eq.queued');
  if (!claimed) return json({ error: 'This check has already started.' }, 409);
  const access: CreditAccess = await reserveCredits(user, cost, 'check_' + action);
  if (!access.ok) {
    await adminUpdate('check_reviews', review.id, { status: 'queued', started_at: null });
    return json({ error: creditMessage(access, cost), ...access }, 402);
  }
  await adminUpdate('check_reviews', review.id, {
    page_count: pages.length, credits_charged: access.credits_charged ?? 0, credit_access: access, error: null, notice: null,
    report: { quick: true, template },
  });

  const context = [
    `Project title: ${review.title || 'not given'}`,
    `Jurisdiction: ${review.jurisdiction || 'not given — state the model code you assumed'}`,
    `Building / occupancy type: ${review.building_type || 'not given'}`,
    `Pages attached: ${pages.length}`,
  ].join('\n');
  const content: any[] = [];
  for (const p of pages) {
    content.push({ type: 'input_text', text: `PAGE ${p.page} (full page)` }, { type: 'input_image', image_url: p.image, detail: 'high' });
    for (const t of p.tiles) content.push({ type: 'input_text', text: `PAGE ${p.page}, ${t.label} (close-up; positions are still fractions of the full page)` }, { type: 'input_image', image_url: t.image, detail: 'high' });
  }
  const layer = textLayer(body?.page_text);
  if (layer) content.push({ type: 'input_text', text: layer });
  content.push({ type: 'input_text', text: context });
  const effort = ['minimal', 'low', 'medium'].includes(String(process.env.DRAWUP_CHECK_QUICK_EFFORT)) ? process.env.DRAWUP_CHECK_QUICK_EFFORT : 'low';
  const payload = {
    instructions: QUICK_INSTRUCTIONS,
    input: [{ role: 'user', content }],
    reasoning: { effort },
    max_output_tokens: 20000,
    text: { format: { type: 'json_schema', name: 'drawup_quick_check', strict: true, schema: QUICK_SCHEMA } },
  };

  const fail = async (message: string) => {
    const r = await adminUpdate('check_reviews', review.id, { status: 'failed', error: message + ' Your credits were refunded.', completed_at: new Date().toISOString() }, 'status=eq.reviewing');
    if (r) await refundCredits(user.id, access, 'check_refund');
    return r;
  };

  let started: { res: Response; model: string };
  try { started = await openStream(payload, models(process.env.DRAWUP_CHECK_QUICK_MODEL, 'gpt-5-mini')); }
  catch (e: any) { await fail(e?.message || 'The check could not start.'); return json({ error: (e?.message || 'The check could not start.') + ' You were not charged.' }, 502); }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      let open = true;
      const send = (o: unknown) => { if (!open) return; try { ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { open = false; } };
      // Keeps proxies from closing a quiet connection while the model reads the pages.
      const ping = setInterval(() => send({ t: 'ping' }), 8000);
      send({ t: 'start', model: started.model, pages: pages.length });
      let text = '', status = '', errMsg = '';
      try {
        await adminUpdate('check_reviews', review.id, { model: started.model });
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
            if (e.type === 'response.output_text.delta') { text += e.delta || ''; send({ t: 'delta', d: e.delta || '' }); }
            else if (e.type === 'response.completed') status = 'completed';
            else if (e.type === 'response.incomplete') { status = 'incomplete'; errMsg = 'the AI reached its output limit'; }
            else if (e.type === 'response.failed' || e.type === 'error') { status = 'failed'; errMsg = e.response?.error?.message || e.message || 'the AI job failed'; }
          }
        }
      } catch (e: any) { status = status || 'failed'; errMsg = errMsg || e?.message || 'the connection to the AI dropped'; }

      let saved: any = null;
      try {
        const parsed = parseReport(text, ['findings'], ['summary', 'code_basis', 'limitations']);
        const findings = parsed ? normFindings(parsed.report?.findings) : [];
        const partial = status !== 'completed' || !!parsed?.partial;
        if (!findings.length && (partial || !parsed)) saved = await fail(errMsg ? `The check stopped: ${errMsg}.` : 'The check came back unreadable.');
        else {
          const rep = parsed!.report || {};
          saved = await adminUpdate('check_reviews', review.id, {
            status: 'complete', findings, sources: [],
            summary: [String(rep.summary || ''), rep.code_basis ? `Code basis: ${rep.code_basis}` : '', rep.limitations ? `Limits of this review: ${rep.limitations}` : ''].filter(Boolean).join('\n\n'),
            notice: partial ? `This check stopped early (${errMsg || 'the answer was cut off'}). It shows the ${findings.length} item${findings.length === 1 ? '' : 's'} written before it stopped. You were not charged for it.` : null,
            completed_at: new Date().toISOString(),
          }, 'status=eq.reviewing');
          if (saved && partial) await refundCredits(user.id, access, 'check_partial_refund');
          if (saved) await awardXp(user.id, 'check', review.id);
        }
      } catch (e: any) { console.error('[drawup] quick check save failed', e); }
      clearInterval(ping);
      if (saved?.status === 'complete') send({ t: 'done', review: saved });
      else send({ t: 'error', error: saved?.error || 'The check did not finish. Your credits were refunded.', review: saved });
      if (open) try { ctrl.close(); } catch { /* page already left */ }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}
