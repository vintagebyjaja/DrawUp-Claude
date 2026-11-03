import { awardXp } from '@/lib/drawup-coach-persona';
import { ASK_INSTRUCTIONS, ASK_SCHEMA, DISCIPLINES, GOALS, REVIEW_SCHEMA, cleanAnswer, cleanReview, reviewInstructions, type Goal } from '@/lib/drawup-portfolio';
import {
  PRIVATE_BUCKET, adminRest, adminSelectOne, adminUpdate, creditMessage, missingConfig, models, openaiBackground, openaiCancel, openaiGet,
  outputText, pathIsOwn, readTicket, refundCredits, refundOnce, reserveCredits, signTicket, signedInUser, storageSignedUrls, type CreditAccess,
} from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Season 1 Portfolio Review (Portal › Discover › Portfolio Review, #portal/portfolio).
// The page uploads the original PDF untouched to student-portfolios/<uid>/<id>/, renders the selected pages to
// pictures in drawup-private/<uid>/portfolio/<id>/, and inserts an empty portfolio_reviews row (RLS, SQL 0073).
// This route then does everything that costs credits or writes results, with the same background pattern as
// Draw a detail (no long requests on Cloudflare):
//   start    { start: <review id>, text_layer?: [{ page, text }] } -> claims the row once (submitted|failed ->
//            reviewing), reserves credits, starts a stored background AI job on the page pictures, saves its id.
//   poll     { poll: <review id> } -> { status, review }. On completion the cleaned review is saved to the row;
//            on failure or after MAX_RUN_MS the credits are refunded once and the row is marked failed.
//   ask      { ask: <review id>, page, question } -> { status: 'running', ticket }: Arch Coach on one page.
//   ask poll { poll_ask: <ticket> } -> { status: 'done', answer } (also saved to the row's questions).
//   link     { link: <review id>, project_thread_id: <project id> | null } -> file the review under a project.
//   GET      -> { cost, ask_cost, max_pages, ready } so the page can show prices before anything is charged.
// Settings (optional): DRAWUP_PORTFOLIO_COST (default 30 credits, needs Jaja's OK), DRAWUP_PORTFOLIO_ASK_COST
// (default 1), DRAWUP_PORTFOLIO_MODEL (default gpt-5, then gpt-5-mini), DRAWUP_PORTFOLIO_EFFORT (low | medium,
// default medium), DRAWUP_PORTFOLIO_ASK_MODEL (default gpt-5-mini). HQ accounts are never charged.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGES = 40;
const MAX_RUN_MS = 25 * 60 * 1000;
const TICKET_MAX_AGE_MS = 6 * 3600 * 1000;
const ACTION = 'portfolio_review';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const price = (name: string, d: number) => Math.max(0, Math.round(Number(process.env[name]) || d));
const str = (v: unknown, max: number) => String(v ?? '').slice(0, max).trim();
const effort = () => (['low', 'medium'].includes(String(process.env.DRAWUP_PORTFOLIO_EFFORT)) ? process.env.DRAWUP_PORTFOLIO_EFFORT : 'medium');
const sqlMissing = (e: unknown) => /column|schema cache|portfolio_reviews|PGRST/i.test(String((e as any)?.message || e));
const NEED_SQL = 'Portfolio Review needs its database update. Run the Portfolio Review SQL (portfolio-01) in Supabase.';

/** Only the fields the page needs (credit_access stays on the server). */
function publicRow(r: any) {
  if (!r) return r;
  const { credit_access: _c, ...rest } = r;
  return { ...rest, pages: (rest.pages || []).map((p: any) => ({ n: p.n, path: p.path, w: p.w, h: p.h })) };
}
async function loadOwned(id: unknown, userId: string) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) return null;
  const row = await adminSelectOne<any>('portfolio_reviews', `id=eq.${id}&select=*`);
  return row && row.user_id === userId ? row : null;
}
/** The page pictures this row may use: the member's own folder for this review, in page order, at most MAX_PAGES. */
function ownPages(row: any, userId: string) {
  const prefix = `${userId}/portfolio/${row.id}/`;
  return (Array.isArray(row.pages) ? row.pages : [])
    .filter((p: any) => p && typeof p.path === 'string' && pathIsOwn(p.path, userId) && p.path.startsWith(prefix) && Number(p.n) > 0)
    .sort((a: any, b: any) => a.n - b.n).slice(0, MAX_PAGES);
}

export async function GET() {
  return json({ cost: price('DRAWUP_PORTFOLIO_COST', 30), ask_cost: price('DRAWUP_PORTFOLIO_ASK_COST', 1), max_pages: MAX_PAGES, ready: !missingConfig() });
}

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to DrawUp to review a portfolio.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'Portfolio Review is not connected yet: ' + notReady }, 503);
  if (Number(request.headers.get('content-length') || 0) > 2 * 1024 * 1024) return json({ error: 'That request is too large.' }, 413);
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.start) return await start(user, body.start, body.text_layer);
    if (body?.poll) return await poll(user, body.poll);
    if (body?.ask) return await ask(user, body.ask, body.page, body.question);
    if (typeof body?.poll_ask === 'string') return await pollAsk(user, body.poll_ask);
    if (body?.link) return await link(user, body.link, body.project_thread_id);
  } catch (e: any) {
    console.error('[drawup] portfolio', e);
    return json({ error: sqlMissing(e) ? NEED_SQL : e?.message || 'Portfolio Review hit a problem. Try again.' }, 500);
  }
  return json({ error: 'Unknown Portfolio Review action.' }, 400);
}

/* ------------------------------------------------------------------ review */
async function start(user: { id: string; email?: string; is_anonymous?: boolean }, id: unknown, textLayer: unknown) {
  const row = await loadOwned(id, user.id);
  if (!row) return json({ error: 'That portfolio review could not be found.' }, 404);
  if (row.status === 'reviewing' || row.status === 'complete') return json({ status: row.status, review: publicRow(row) });
  const goal: Goal = (GOALS as readonly string[]).includes(row.goal) ? row.goal : 'general';
  const discipline = (DISCIPLINES as readonly string[]).includes(row.discipline) ? row.discipline : 'architecture';
  const pages = ownPages(row, user.id);
  if (!pages.length) return json({ error: 'No pages were uploaded for this portfolio. Choose the PDF again.' }, 400);

  // Text the PDF itself carries, per page, kept on the row so the result can check printed project titles.
  const layer = new Map<number, string>();
  for (const t of Array.isArray(textLayer) ? textLayer.slice(0, 400) : []) {
    const n = Math.round(Number(t?.page)); const s = str(t?.text, 4000).replace(/\s+/g, ' ');
    if (n > 0 && s && pages.some((p: any) => p.n === n)) layer.set(n, s);
  }
  const withText = pages.map((p: any) => ({ n: p.n, path: p.path, w: p.w, h: p.h, text: layer.get(p.n) || str(p.text, 4000) }));

  // Claim the row once, before any credits move, so a double click or a retry can never charge twice.
  const claimed = await adminUpdate('portfolio_reviews', row.id, { status: 'reviewing', error: null, started_at: new Date().toISOString(), pages: withText, ai_response_id: null }, 'status=in.(submitted,failed)');
  if (!claimed) { const now = await loadOwned(row.id, user.id); return json({ status: now?.status, review: publicRow(now) }); }
  const back = async (msg: string, status: number, extra: Record<string, unknown> = {}) => {
    await adminUpdate('portfolio_reviews', row.id, { status: row.status === 'failed' ? 'failed' : 'submitted', error: msg }).catch(() => {});
    return json({ error: msg, ...extra }, status);
  };

  const cost = price('DRAWUP_PORTFOLIO_COST', 30);
  const access: CreditAccess = await reserveCredits(user, cost, ACTION);
  if (!access.ok) return back(creditMessage(access, cost), 402, { ...access });

  let links: (string | null)[] = [];
  try { links = await storageSignedUrls(PRIVATE_BUCKET, withText.map((p: any) => p.path), 3 * 3600); } catch { links = []; }
  if (!links.length || links.some(l => !l)) { await refundCredits(user.id, access, ACTION + '_refund'); return back('Your page pictures could not be read. Choose the PDF again. You were not charged.', 400); }

  const content: any[] = [];
  withText.forEach((p: any, i: number) => content.push({ type: 'input_text', text: `PAGE ${p.n}` }, { type: 'input_image', image_url: links[i], detail: 'high' }));
  const text = withText.filter((p: any) => p.text).map((p: any) => `--- PAGE ${p.n} ---\n${p.text}`).join('\n').slice(0, 60000);
  content.push({ type: 'input_text', text: text ? 'TEXT LAYER (printed text extracted from the PDF by DrawUp):\n' + text : 'TEXT LAYER: none (the pages are pictures only; read text from the images and do not guess unreadable words).' });
  content.push({ type: 'input_text', text: `FILE: ${row.file_name || 'portfolio.pdf'} · ${row.page_count || withText.length} pages in the PDF · ${withText.length} selected for review.` });
  const payload = {
    instructions: reviewInstructions(goal, discipline, withText.map((p: any) => p.n), row.page_count || withText.length),
    input: [{ role: 'user', content }],
    reasoning: { effort: effort() },
    max_output_tokens: 24000,
    text: { format: { type: 'json_schema', name: 'drawup_portfolio_review', strict: true, schema: REVIEW_SCHEMA } },
  };
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload, models(process.env.DRAWUP_PORTFOLIO_MODEL, 'gpt-5', 'gpt-5-mini')); }
  catch (e: any) { await refundCredits(user.id, access, ACTION + '_refund'); return back((e?.message || 'The review could not start.') + ' You were not charged.', 502); }
  const saved = await adminUpdate('portfolio_reviews', row.id, { ai_response_id: made.id, ai_model: made.model, credits_charged: access.credits_charged ?? 0, credit_access: access });
  return json({ status: 'reviewing', review: publicRow(saved), credits_charged: access.credits_charged ?? 0 });
}

async function poll(user: { id: string }, id: unknown) {
  const row = await loadOwned(id, user.id);
  if (!row) return json({ error: 'That portfolio review could not be found.', final: true }, 404);
  if (row.status !== 'reviewing') return json({ status: row.status, review: publicRow(row) });
  const access = (row.credit_access || {}) as CreditAccess;
  const fail = async (why: string) => {
    const failed = await adminUpdate('portfolio_reviews', row.id, { status: 'failed', error: `The review did not finish: ${why}. You were not charged.` }, 'status=eq.reviewing');
    if (failed) await refundOnce(user.id, access, ACTION + '_refund', row.ai_response_id || row.id);
    const now = failed || (await loadOwned(row.id, user.id));
    return json({ status: now?.status, review: publicRow(now) });
  };
  const elapsed = Date.now() - new Date(row.started_at || row.updated_at || row.created_at).getTime();
  if (!row.ai_response_id) return elapsed > 120000 ? fail('the AI job never started') : json({ status: 'reviewing', review: publicRow(row) });
  if (elapsed > MAX_RUN_MS) { await openaiCancel(row.ai_response_id); return fail('it ran longer than 25 minutes'); }
  let data: any;
  try { data = await openaiGet(row.ai_response_id); } catch { return json({ status: 'reviewing', review: publicRow(row), retry: true }); }
  if (data?.status === 'queued' || data?.status === 'in_progress') return json({ status: 'reviewing', review: publicRow(row), elapsed: Math.round(elapsed / 1000) });
  if (data?.status !== 'completed') return fail(data?.status === 'incomplete' ? 'the AI reached its output limit' : data?.error?.message || 'the AI job failed');
  let feedback: ReturnType<typeof cleanReview>;
  const pages = ownPages(row, user.id);
  try { feedback = cleanReview(JSON.parse(outputText(data)), pages.map((p: any) => p.n), pages.map((p: any) => p.text || '').join(' ')); }
  catch { return fail('the answer came back unreadable'); }
  if (!feedback.readable) return fail(feedback.summary || 'the pages could not be read');
  const done = await adminUpdate('portfolio_reviews', row.id, {
    status: 'complete', feedback: { ...feedback, goal: row.goal, model: row.ai_model, reviewed_at: new Date().toISOString() }, completed_at: new Date().toISOString(), error: null,
  }, 'status=eq.reviewing');
  if (done) await awardXp(user.id, 'check', 'portfolio:' + row.id).catch(() => {});
  return json({ status: 'complete', review: publicRow(done || (await loadOwned(row.id, user.id))) });
}

/* ------------------------------------------------------------------ ask Arch Coach about one page */
async function ask(user: { id: string; email?: string; is_anonymous?: boolean }, id: unknown, pageNo: unknown, question: unknown) {
  const q = str(question, 1500);
  if (q.length < 3) return json({ error: 'Type a question for Arch Coach.' }, 400);
  const row = await loadOwned(id, user.id);
  if (!row) return json({ error: 'That portfolio review could not be found.' }, 404);
  const n = Math.round(Number(pageNo));
  const page = ownPages(row, user.id).find((p: any) => p.n === n);
  if (!page) return json({ error: 'Pick one of the reviewed pages first.' }, 400);
  const cost = price('DRAWUP_PORTFOLIO_ASK_COST', 1);
  const access: CreditAccess = await reserveCredits(user, cost, 'portfolio_ask');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  let link: string | null = null;
  try { [link] = await storageSignedUrls(PRIVATE_BUCKET, [page.path], 3600); } catch {}
  if (!link) { await refundCredits(user.id, access, 'portfolio_ask_refund'); return json({ error: 'That page picture could not be read. You were not charged.' }, 400); }
  const fb = row.feedback || {};
  const context = { goal: row.goal, discipline: row.discipline, summary: fb.summary || '', page: (fb.pages || []).find((p: any) => p.page === n) || null, improvements_on_page: (fb.improvements || []).filter((i: any) => (i.pages || []).includes(n)) };
  const earlier = (Array.isArray(row.questions) ? row.questions : []).filter((x: any) => x.page === n).slice(-4);
  const payload = {
    instructions: ASK_INSTRUCTIONS,
    input: [{ role: 'user', content: [
      { type: 'input_text', text: `PAGE ${n}` }, { type: 'input_image', image_url: link, detail: 'high' },
      { type: 'input_text', text: (page.text ? `TEXT ON THE PAGE: ${String(page.text).slice(0, 3000)}\n` : '') + 'REVIEW CONTEXT: ' + JSON.stringify(context).slice(0, 20000) },
      { type: 'input_text', text: 'EARLIER QUESTIONS ON THIS PAGE:\n' + (earlier.map((e: any) => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n') || '(none)') },
      { type: 'input_text', text: 'QUESTION: ' + q },
    ] }],
    reasoning: { effort: 'low' },
    max_output_tokens: 4000,
    text: { format: { type: 'json_schema', name: 'drawup_portfolio_answer', strict: true, schema: ASK_SCHEMA } },
  };
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload, models(process.env.DRAWUP_PORTFOLIO_ASK_MODEL, 'gpt-5-mini', 'gpt-5')); }
  catch (e: any) { await refundCredits(user.id, access, 'portfolio_ask_refund'); return json({ error: (e?.message || 'Arch Coach could not be reached.') + ' You were not charged.' }, 502); }
  return json({ status: 'running', ticket: signTicket({ v: 1, k: 'pask', u: user.id, r: made.id, t: Date.now(), id: row.id, p: n, q, a: access }), credits_charged: access.credits_charged ?? 0 });
}

async function pollAsk(user: { id: string }, ticket: string) {
  const t = readTicket<any>(ticket);
  if (!t || t.v !== 1 || t.k !== 'pask' || t.u !== user.id || !t.r) return json({ error: 'That question is not yours.', final: true }, 403);
  if (Date.now() - Number(t.t || 0) > TICKET_MAX_AGE_MS) return json({ error: 'That question expired. Ask it again.', final: true }, 410);
  let data: any;
  try { data = await openaiGet(t.r); } catch { return json({ status: 'running', retry: true }); }
  if (data?.status === 'queued' || data?.status === 'in_progress') return json({ status: 'running' });
  const fail = async (why: string) => { await refundOnce(user.id, t.a, 'portfolio_ask_refund', t.r); return json({ error: `Arch Coach could not answer: ${why}. You were not charged.`, final: true }, 502); };
  if (data?.status !== 'completed') return fail(data?.status === 'incomplete' ? 'the answer ran too long' : data?.error?.message || 'the AI job failed');
  let a: ReturnType<typeof cleanAnswer>;
  try { a = cleanAnswer(JSON.parse(outputText(data))); } catch { return fail('the answer came back unreadable'); }
  if (!a.answer) return fail('the answer came back empty');
  const entry = { id: t.r, page: t.p, question: t.q, answer: a.answer, follow_ups: a.follow_ups, credits_charged: t.a?.credits_charged ?? 0, at: new Date().toISOString() };
  // Saved on the review (once per AI answer), so the questions are there next time the review is opened.
  const row = await loadOwned(t.id, user.id);
  let saved = false;
  if (row) {
    const list = Array.isArray(row.questions) ? row.questions : [];
    if (list.some((x: any) => x.id === t.r)) saved = true;
    else { const r = await adminRest(`portfolio_reviews?id=eq.${row.id}&user_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ questions: [...list, entry].slice(-200) }) }); saved = r.ok; }
  }
  return json({ status: 'done', answer: entry, saved });
}

/* ------------------------------------------------------------------ file under a project */
async function link(user: { id: string }, id: unknown, projectId: unknown) {
  const row = await loadOwned(id, user.id);
  if (!row) return json({ error: 'That portfolio review could not be found.' }, 404);
  let pid: string | null = null;
  if (projectId) {
    if (typeof projectId !== 'string' || !UUID_RE.test(projectId)) return json({ error: 'That project could not be found.' }, 404);
    const p = await adminSelectOne<any>('project_threads', `id=eq.${projectId}&owner_id=eq.${user.id}&select=id`);
    if (!p) return json({ error: 'You can only file a review under your own project.' }, 403);
    pid = p.id;
  }
  const r = await adminRest(`portfolio_reviews?id=eq.${row.id}&user_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ project_thread_id: pid }) });
  if (!r.ok) return json({ error: 'The project could not be saved.' }, 500);
  return json({ ok: true, review: publicRow((await r.json())[0]) });
}
