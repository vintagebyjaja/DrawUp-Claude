import { accountGate, adminRest, adminSelectOne, adminUpdate, creditMessage, missingConfig, openaiCreate, outputText, refundCredits, refundOnce, reserveCredits, signedInUser, type CreditAccess } from '@/lib/drawup-server';
import { recordDetailQuery } from '@/lib/drawup-details';
import { awardXp } from '@/lib/drawup-coach-persona';
import {
  JOB_TITLE, MEMORY_EVERY, NEXT_MARK, SPEAKER_NAME, UUID_RE, buildTeamPrompt, coachCost, jobModels, jobPrompt, loadContext, memoryPrompt, metric,
  needsVerification, parseNext, prefsFor, projectFor, routeAssistant, scopeKey, sixthCommand, teamCosts, teamModels, threadFor, wantsLayoutOption,
  type Speaker, type Thread,
} from '@/lib/drawup-team';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V25 AI Design Team: one message in, one streamed reply out (NDJSON, same transport as Draw it up and Quick Check).
// The reply is written by a fast model and streamed word by word from the AI service, so the first words show in
// about a second. Long work (Coach's code verification, 6th Man's "take the shot", a new layout option) starts as
// a stored background job (team_jobs) and posts its result into the same thread later; see ../jobs/route.ts.
//
// Lines sent to the page:
//   {t:'meta', thread_id, user_message_id, message_id, speaker, named, credits_charged, credits_remaining}
//   {t:'status', status:'reviewing'|'writing'}      real progress only
//   {t:'delta', text}                                 answer text as it is written
//   {t:'job', job}                                    a background job this reply started
//   {t:'done', message}  /  {t:'error', error}        the saved message, or why it failed
// A retried request (same request_id in the same thread) gets {t:'replay', ...} and is never charged twice.

const OPENAI_KEY = () => process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const REQ_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function insert(table: string, body: Record<string, unknown>) {
  const r = await adminRest(table, { method: 'POST', body: JSON.stringify(body) });
  const out = await r.json().catch(() => null);
  if (!r.ok) { const e: any = new Error(out?.message || `Could not save to ${table}.`); e.code = out?.code; throw e; }
  return Array.isArray(out) ? out[0] : out;
}

/** Opens a streamed answer, trying each model in turn (only an unknown model falls through). */
async function openStream(payload: Record<string, unknown>, list: string[], signal: AbortSignal) {
  let last = 'The AI request failed.';
  for (const model of list) {
    const r = await fetch(OPENAI_BASE() + '/responses', {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${OPENAI_KEY()}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...payload, model, stream: true, store: false }),
    });
    if (r.ok && r.body) return { res: r, model };
    const data = await r.json().catch(() => ({}));
    last = data?.error?.message || `The AI service returned ${r.status}.`;
    if ([400, 404].includes(r.status) && /model/i.test(last)) continue;
    throw new Error(last);
  }
  throw new Error(last);
}

/** Starts a stored background job (the AI keeps working when the page closes). Never charges twice for one key. */
async function startJob(args: { userId: string; thread: Thread; projectId: string | null; requestId: string; requestMessageId: string; kind: 'coach_verify' | 'sixth_man_shot' | 'layout_option'; payload: { instructions: string; input: string }; research: boolean; action: string; access: CreditAccess; credits: number; input: Record<string, unknown> }) {
  const key = args.kind + ':' + args.requestId;
  const existing = await adminSelectOne<any>('team_jobs', `owner_id=eq.${args.userId}&idempotency_key=eq.${encodeURIComponent(key)}&select=*`).catch(() => null);
  if (existing) return { job: existing, charged: false };
  const body: any = { instructions: args.payload.instructions, input: args.payload.input, background: true, store: true, max_output_tokens: 6000 };
  if (args.research) body.tools = [{ type: 'web_search' }];
  body.reasoning = { effort: args.research ? 'low' : 'medium' };
  let created: any;
  try { created = (await openaiCreate(body, jobModels(args.kind))).data; }
  catch (e: any) {
    if (!/reasoning|effort/i.test(e?.message || '')) throw e;
    delete body.reasoning; created = (await openaiCreate(body, jobModels(args.kind))).data;
  }
  const job = await insert('team_jobs', {
    owner_id: args.userId, coach_thread_id: args.thread.id, project_thread_id: args.projectId, request_message_id: args.requestMessageId,
    kind: args.kind, speaker: args.kind === 'coach_verify' ? 'coach' : args.kind === 'sixth_man_shot' ? 'sixth_man' : 'teammate',
    title: JOB_TITLE[args.kind], status: 'running', response_id: created?.id || null, input: args.input, action: args.action,
    access: args.access, credits: args.credits, idempotency_key: key,
  });
  return { job, charged: true };
}

export async function POST(request: Request) {
  const t0 = Date.now();
  const user = await signedInUser(request);
  if (!user) return json({ error: 'Sign in to talk with the AI Design Team.' }, 401);
  if (user.is_anonymous) return json({ error: 'Create a free DrawUp account to use the AI Design Team. Teammate and 6th Man are included on the Free plan.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'The AI Design Team is not connected yet: ' + notReady }, 503);

  const body = await request.json().catch(() => ({}));
  const message = String(body?.message || '').trim().slice(0, 6000);
  const requestId = String(body?.request_id || '');
  if (!message) return json({ error: 'Message required.' }, 400);
  if (!REQ_RE.test(requestId)) return json({ error: 'Missing request id. Refresh the page.' }, 400);
  const images = (Array.isArray(body?.images) ? body.images : []).map(String).filter((x: string) => IMG_RE.test(x)).slice(0, 3);
  if (images.reduce((n: number, x: string) => n + x.length, 0) > 12 * 1024 * 1024) return json({ error: 'Those pictures are too large together.' }, 413);
  const attachments = (Array.isArray(body?.attachments) ? body.attachments : []).slice(0, 3)
    .map((a: any) => ({ kind: 'image', name: String(a?.name || 'picture').slice(0, 120), path: String(a?.path || '') }))
    .filter((a: any) => a.path.split('/')[0] === user.id && !a.path.includes('..'));
  const continueOf = UUID_RE.test(String(body?.continue_of || '')) ? String(body.continue_of) : '';

  const gated = await accountGate(user);
  if (gated) return json({ error: creditMessage(gated, 0), ...gated }, 402);

  // ---- thread + project (permissions are checked on every message, so a removed member loses access at once)
  let thread: Thread | null = null;
  if (body?.thread_id) {
    thread = await threadFor(user.id, String(body.thread_id));
    if (!thread) return json({ error: 'This conversation belongs to another account.' }, 403);
  }
  const project = await projectFor(user.id, thread ? thread.project_thread_id : String(body?.project_id || ''));
  if (!thread && body?.project_id && !project) return json({ error: 'You do not have access to that project.' }, 403);

  // ---- who is answering
  const selected = String(body?.assistant || 'teammate');
  const routed = continueOf ? { speaker: (SPEAKER_NAME[selected as Speaker] ? selected : 'teammate') as Speaker, named: false } : routeAssistant(message, selected);
  const speaker = routed.speaker;
  const command = speaker === 'sixth_man' ? sixthCommand(message) : null;
  const verify = speaker === 'coach' && !images.length && !continueOf && needsVerification(message);
  const layout = speaker === 'teammate' && !continueOf && wantsLayoutOption(message);
  const shot = speaker === 'sixth_man' && command === 'shot';
  const costs = teamCosts();
  const priced = images.length ? { action: 'plan_analysis', cost: costs.image }
    : speaker === 'coach' ? coachCost(message, false)
    : { action: 'team_chat', cost: costs.chat };
  const jobCost = shot ? costs.shot : layout ? costs.layout : 0;

  // ---- create the thread if needed, then save the user's message (unique per request id = no double answers)
  if (!thread) {
    // A retried first message (no thread yet) must not open a second thread: find the one it already made.
    const seen = await adminSelectOne<any>('coach_messages', `client_request_id=eq.${encodeURIComponent(requestId)}&role=eq.user&select=thread_id`).catch(() => null);
    if (seen) thread = await threadFor(user.id, seen.thread_id);
  }
  if (!thread) {
    thread = await insert('coach_threads', { owner_id: user.id, title: message.slice(0, 60), type: project ? 'project' : 'general', project_thread_id: project?.id || null, team: true });
  }
  const th = thread!;
  let userMsg: any;
  try {
    userMsg = await insert('coach_messages', { thread_id: th.id, role: 'user', content: message, client_request_id: requestId, meta: { to: speaker, named: routed.named, continue_of: continueOf || undefined }, ...(attachments.length ? { attachments } : {}) });
  } catch (e: any) {
    if (e.code !== '23505') {
      if (/column|schema cache/i.test(e.message)) return json({ error: 'The AI Design Team database update is not installed yet. Run the v25 SQL files (v25-01 to v25-05) in Supabase.' }, 503);
      throw e;
    }
    // A retry of a request we already have: send back what exists, charge nothing.
    const um = await adminSelectOne<any>('coach_messages', `thread_id=eq.${th.id}&client_request_id=eq.${encodeURIComponent(requestId)}&select=id`);
    const reply = um ? await adminSelectOne<any>('coach_messages', `reply_to=eq.${um.id}&role=eq.assistant&select=id,content,speaker,status,meta,created_at&order=created_at`) : null;
    return json({ t: 'replay', thread_id: th.id, user_message_id: um?.id || null, message: reply });
  }
  await recordDetailQuery(message, 'arch_coach', user.id).catch(() => {});

  // ---- credits: taken before any AI runs, given back if nothing useful came out
  const access: CreditAccess = await reserveCredits(user, priced.cost, priced.action);
  if (!access.ok) {
    const sys = await insert('coach_messages', { thread_id: th.id, role: 'assistant', speaker, status: 'failed', reply_to: userMsg.id, content: creditMessage(access, priced.cost) + ' Your conversation, saved ideas and drawings are all kept.', meta: { credit_block: true } }).catch(() => null);
    return json({ error: creditMessage(access, priced.cost), ...access, thread_id: th.id, user_message_id: userMsg.id, message: sys }, 402);
  }

  const prefs = await prefsFor(user.id);
  const aware = speaker === 'teammate' || (speaker === 'sixth_man' ? prefs.sixth_man_aware : prefs.coach_aware);
  const ctx = await loadContext(user.id, th, project, aware);
  let continueText = '';
  if (continueOf) {
    const prev = await adminSelectOne<any>('coach_messages', `id=eq.${continueOf}&thread_id=eq.${th.id}&select=content`).catch(() => null);
    continueText = prev?.content || '';
  }
  const prompt = await buildTeamPrompt({ userId: user.id, speaker, message, ctx, prefs, command, verifying: verify, continueText, layoutJob: layout });
  const content: any[] = [{ type: 'input_text', text: prompt.input }];
  images.forEach((img: string, i: number) => content.push({ type: 'input_text', text: `<user_files>PICTURE ${i + 1}</user_files>` }, { type: 'input_image', image_url: img }));
  const payload = { instructions: prompt.instructions, input: content.length > 1 ? [{ role: 'user', content }] : prompt.input, max_output_tokens: prefs.concise ? 900 : 1800 };

  const assistant = await insert('coach_messages', { thread_id: th.id, role: 'assistant', speaker, status: 'streaming', content: '', reply_to: userMsg.id, meta: { continued_from: continueOf || undefined, command: command || undefined } });
  await adminRest(`coach_threads?id=eq.${th.id}`, { method: 'PATCH', body: JSON.stringify({ updated_at: new Date().toISOString() }) }).catch(() => {});

  const upstreamAbort = new AbortController();
  let started: { res: Response; model: string };
  try { started = await openStream(payload, teamModels(speaker), upstreamAbort.signal); }
  catch (e: any) {
    await refundCredits(user.id, access, priced.action + '_refund');
    await adminUpdate('coach_messages', assistant.id, { status: 'failed', content: `${SPEAKER_NAME[speaker]} could not answer just now. You were not charged. Try again.`, updated_at: new Date().toISOString() }).catch(() => {});
    await metric({ user_id: user.id, speaker, kind: 'chat', ok: false, error: String(e?.message || e).slice(0, 300), total_ms: Date.now() - t0 });
    return json({ error: `${SPEAKER_NAME[speaker]} could not answer just now (${e?.message || 'AI unavailable'}). You were not charged.`, thread_id: th.id, user_message_id: userMsg.id }, 502);
  }

  const enc = new TextEncoder();
  let full = '', sentLen = 0, firstMs = 0, closed = false, finished = false, jobHoldsCredits = false;
  const visible = () => { const i = full.indexOf(NEXT_MARK); return i >= 0 ? full.slice(0, i) : full; };
  const finishStopped = async () => {
    if (finished) return; finished = true;
    const text = visible().trim();
    // Stopped before any words arrived: nothing was delivered, so the credits come back.
    // (Not when Coach's verification job is still running on the same credits.)
    if (!text && !jobHoldsCredits) await refundOnce(user.id, access, priced.action, 'stop:' + assistant.id);
    await adminUpdate('coach_messages', assistant.id, { status: 'stopped', content: text, updated_at: new Date().toISOString() }, 'status=eq.streaming').catch(() => {});
  };

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => { if (closed) return; try { ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n')); } catch { closed = true; } };
      const ping = setInterval(() => send({ t: 'ping' }), 8000);
      send({ t: 'meta', thread_id: th.id, thread_title: th.title, project_id: project?.id || null, user_message_id: userMsg.id, message_id: assistant.id, speaker, named: routed.named, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null, unlimited: !!access.hq || access.access_type === 'unlimited' });
      send({ t: 'status', status: speaker === 'sixth_man' || speaker === 'coach' ? 'reviewing' : 'writing' });

      // Background work starts right away, in parallel with the chat reply.
      const jobP = (async () => {
        if (!verify && !shot && !layout) return null;
        const kind = verify ? 'coach_verify' : shot ? 'sixth_man_shot' : 'layout_option';
        const lastPlay = shot ? ctx.history.slice().reverse().find(m => m.speaker === 'sixth_man' && m.meta?.plays?.length) : null;
        const question = shot ? `${message}${lastPlay ? '\nPLAYS OFFERED EARLIER: ' + lastPlay.meta.plays.map((p: any, i: number) => `Play ${i + 1}: ${p.title} - ${p.summary}`).join(' | ') : ''}` : message;
        // Coach's verification is covered by the question's price (as in Arch Coach). The other jobs are priced
        // on their own and reserved separately, so a failed job refunds exactly its own credits.
        let jobAccess: CreditAccess = access;
        if (kind !== 'coach_verify') {
          jobAccess = await reserveCredits(user, jobCost, 'team_' + kind);
          if (!jobAccess.ok) { send({ t: 'job_error', error: creditMessage(jobAccess, jobCost) + ' The background task was not started.' }); return null; }
        }
        try {
          const { job } = await startJob({
            userId: user.id, thread: th, projectId: project?.id || null, requestId, requestMessageId: userMsg.id, kind,
            payload: jobPrompt(kind, { question, ctx, location: project?.location || '' }), research: verify,
            action: kind === 'coach_verify' ? priced.action : 'team_' + kind, access: jobAccess, credits: kind === 'coach_verify' ? priced.cost : jobCost,
            input: { question: message.slice(0, 2000), reply_message_id: assistant.id },
          });
          if (kind === 'coach_verify') jobHoldsCredits = true;
          const { access: _a, response_id: _r, idempotency_key: _k, ...visibleJob } = job;
          send({ t: 'job', job: visibleJob });
          return job;
        } catch (e: any) {
          if (kind !== 'coach_verify') await refundCredits(user.id, jobAccess, 'team_' + kind + '_refund');
          send({ t: 'job_error', error: `The background task could not start (${e?.message || 'AI unavailable'}).${kind !== 'coach_verify' ? ' Its credits were returned.' : ''}` });
          return null;
        }
      })();

      let status = '', errMsg = '';
      try {
        const reader = started.res.body!.getReader(), dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (finished) { reader.cancel().catch(() => {}); status = 'stopped'; break; } // stopped by the member
          buf += dec.decode(value, { stream: true });
          let cut: number;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, cut); buf = buf.slice(cut + 2);
            const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
            if (!data || data === '[DONE]') continue;
            let e: any; try { e = JSON.parse(data); } catch { continue; }
            if (e.type === 'response.output_text.delta') {
              if (!firstMs) { firstMs = Date.now() - t0; send({ t: 'status', status: 'writing' }); }
              full += e.delta || '';
              // Hold back a few characters so the [[NEXT]] marker is never shown half-written.
              const vis = visible(), safe = full.includes(NEXT_MARK) ? vis.length : Math.max(sentLen, vis.length - NEXT_MARK.length);
              if (safe > sentLen) { send({ t: 'delta', text: vis.slice(sentLen, safe) }); sentLen = safe; }
            } else if (e.type === 'response.completed') status = 'completed';
            else if (e.type === 'response.incomplete') { status = 'incomplete'; errMsg = 'it reached its length limit'; }
            else if (e.type === 'response.failed' || e.type === 'error') { status = 'failed'; errMsg = e.response?.error?.message || e.message || 'the AI job failed'; }
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') status = 'stopped';
        else { status = status || 'failed'; errMsg = errMsg || e?.message || 'the connection to the AI dropped'; }
      }

      const vis = visible();
      if (vis.length > sentLen) { send({ t: 'delta', text: vis.slice(sentLen) }); sentLen = vis.length; }
      const job = await jobP;
      if (status === 'stopped') { await finishStopped(); clearInterval(ping); try { ctrl.close(); } catch {} return; }
      const answer = vis.trim();
      const next = parseNext(full.includes(NEXT_MARK) ? full.slice(full.indexOf(NEXT_MARK) + NEXT_MARK.length) : '');
      let saved: any = null;
      if (!answer) {
        if (!jobHoldsCredits) await refundCredits(user.id, access, priced.action + '_refund');
        const errText = `${SPEAKER_NAME[speaker]} could not answer just now (${errMsg || 'no answer'}). ${jobHoldsCredits ? 'The requirements check is still running and will post here.' : 'You were not charged for the reply.'}`;
        saved = await adminUpdate('coach_messages', assistant.id, { status: 'failed', content: errText, updated_at: new Date().toISOString() }).catch(() => null);
        send({ t: 'error', error: errText, message: saved });
      } else {
        const meta: any = { model: started.model, first_token_ms: firstMs, ...(next.suggestions.length ? { suggestions: next.suggestions } : {}), ...(next.plays.length ? { plays: next.plays } : {}), ...(next.proposal ? { proposal: next.proposal } : {}), ...(next.decision ? { decision: next.decision } : {}), ...(job ? { job_id: job.id } : {}), ...(verify ? { preliminary: true } : {}), ...(continueOf ? { continued_from: continueOf } : {}), ...(command ? { command } : {}), ...(status === 'incomplete' ? { cut_short: true } : {}) };
        saved = await adminUpdate('coach_messages', assistant.id, { status: status === 'incomplete' ? 'stopped' : 'done', content: answer, meta, updated_at: new Date().toISOString() }, 'status=eq.streaming').catch(() => null);
        if (!saved) saved = await adminSelectOne<any>('coach_messages', `id=eq.${assistant.id}&select=id,role,content,speaker,status,meta,reply_to,created_at`).catch(() => null);
        send({ t: 'done', message: saved, credits_remaining: access.credits_remaining ?? null });
        await awardXp(user.id, 'ask', 'team:' + assistant.id).catch(() => {});
      }
      await metric({ user_id: user.id, speaker, kind: continueOf ? 'continue' : 'chat', model: started.model, first_token_ms: firstMs || null, total_ms: Date.now() - t0, chars: answer.length, credits: access.credits_charged ?? 0, ok: !!answer, error: answer ? null : errMsg.slice(0, 300) });

      // Event-driven project memory: refreshed after every dozen new messages, never while idle.
      // It runs on DrawUp's AI key after the reply is finished and never costs the member credits.
      if (answer) await refreshMemory(user.id, th, project?.id || null).catch(e => console.warn('[drawup] team memory refresh', e?.message));
      clearInterval(ping);
      if (!closed) try { ctrl.close(); } catch { /* page already left */ }
    },
    async cancel() {
      // The page stopped reading (Stop button, closed tab): stop the AI and keep what was written.
      closed = true;
      upstreamAbort.abort();
      await finishStopped();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
}

async function refreshMemory(userId: string, thread: Thread, projectId: string | null) {
  const key = scopeKey(projectId, thread.id);
  const row = await adminSelectOne<any>('team_memory', `owner_id=eq.${userId}&scope_key=eq.${encodeURIComponent(key)}&select=id,summary,message_count`).catch(() => null);
  const countR = await adminRest(`coach_messages?thread_id=eq.${thread.id}&select=id`, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  const count = Number((countR.headers.get('content-range') || '').split('/')[1]) || 0;
  if (row && count - Number(row.message_count || 0) < MEMORY_EVERY) return;
  if (!row && count < 6) return;
  const ctx = await loadContext(userId, thread, projectId ? { id: projectId } as any : null, false);
  const p = memoryPrompt(ctx, row?.summary || '');
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const { data } = await openaiCreate({ instructions: p.instructions, input: p.input, max_output_tokens: 600 }, teamModels('teammate'));
    const summary = outputText(data).trim().slice(0, 4000);
    if (!summary) return;
    const fields = { summary, message_count: count, refreshed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (row) await adminUpdate('team_memory', row.id, fields);
    else await insert('team_memory', { owner_id: userId, scope_key: key, project_thread_id: projectId, coach_thread_id: projectId ? null : thread.id, ...fields });
  } finally { clearTimeout(timer); }
}

/** Stop: the page sends what it has shown; the server keeps it (only while the reply is still streaming). */
export async function PATCH(request: Request) {
  const user = await signedInUser(request);
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const body = await request.json().catch(() => ({}));
  const id = String(body?.message_id || '');
  if (!UUID_RE.test(id)) return json({ error: 'Message id required.' }, 400);
  const m = await adminSelectOne<any>('coach_messages', `id=eq.${id}&select=id,thread_id,status`);
  if (!m || !(await threadFor(user.id, m.thread_id))) return json({ error: 'Not your message.' }, 403);
  const text = String(body?.content || '').slice(0, 20000).trim();
  const saved = await adminUpdate('coach_messages', id, { status: 'stopped', content: text, updated_at: new Date().toISOString() }, 'status=eq.streaming').catch(() => null);
  return json({ ok: true, stopped: !!saved });
}
