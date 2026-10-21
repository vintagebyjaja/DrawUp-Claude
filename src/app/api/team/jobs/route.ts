import { adminRest, adminSelectOne, adminUpdate, creditMessage, missingConfig, openaiCancel, openaiCreate, openaiGet, outputText, refundOnce, reserveCredits, signedInUser, sourcesFrom, type CreditAccess } from '@/lib/drawup-server';
import { recordDetailSources } from '@/lib/drawup-details';
import { JOB_SPEAKER, JOB_TITLE, SPEAKER_NAME, UUID_RE, jobModels, jobPrompt, loadContext, metric, projectFor, teamCosts, threadFor } from '@/lib/drawup-team';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V25 AI Design Team background jobs. The AI work itself runs as a stored background response, so it keeps going
// when the member closes the page; this route reports progress and, when a job is done, posts its result into the
// thread exactly once (status running -> finishing is a guarded update, so two open tabs can't post it twice),
// sends an in-app notification and refunds a failed job once.
//
// GET  ?thread_id=…          jobs for one thread (and advances the running ones)
// GET  ?active=1             running + recently finished jobs across all threads (header badge, notification center)
// POST {action:'cancel'|'amend'|'retry'|'track_drawing', …}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const COLS = 'id,coach_thread_id,project_thread_id,request_message_id,result_message_id,kind,speaker,title,status,queued_changes,credits,error,created_at,updated_at,completed_at,input';
const DRAWING_WAIT_MS = 20 * 60 * 1000;

async function insert(table: string, body: Record<string, unknown>) {
  const r = await adminRest(table, { method: 'POST', body: JSON.stringify(body) });
  const out = await r.json().catch(() => null);
  if (!r.ok) throw new Error(out?.message || `Could not save to ${table}.`);
  return Array.isArray(out) ? out[0] : out;
}
const clean = (j: any) => { if (!j) return j; const { access: _a, response_id: _r, idempotency_key: _k, ...rest } = j; return rest; };

/** Moves one running job forward. Returns the job as the page should see it. */
async function advance(job: any): Promise<any> {
  if (job.status !== 'running') return job;
  if (job.kind === 'drawing_set') return advanceDrawing(job);
  if (!job.response_id) return job;
  let data: any;
  try { data = await openaiGet(job.response_id); } catch { return job; }
  if (data.status === 'queued' || data.status === 'in_progress') return job;
  // Claim the job, so only one request posts the result.
  const claimed = await adminUpdate('team_jobs', job.id, { status: 'finishing', updated_at: new Date().toISOString() }, 'status=eq.running').catch(() => null);
  if (!claimed) return (await adminSelectOne('team_jobs', `id=eq.${job.id}&select=${COLS}`)) || job;
  const text = data.status === 'completed' || data.status === 'incomplete' ? outputText(data) : '';
  const now = new Date().toISOString();
  if (!text) {
    await refundOnce(job.owner_id, job.access as CreditAccess, job.action || 'team_job', job.response_id);
    const err = data.status === 'cancelled' ? 'Canceled.' : 'The task did not finish. Its credits were returned. You can retry it.';
    const out = await adminUpdate('team_jobs', job.id, { status: data.status === 'cancelled' ? 'canceled' : 'failed', error: err, updated_at: now, completed_at: now });
    await notify(job, 'failed');
    return out;
  }
  const sources = sourcesFrom(data);
  if (job.kind === 'coach_verify') await recordDetailSources('arch_coach', { userId: job.owner_id }, sources).catch(() => {});
  const queued = (job.queued_changes || []) as string[];
  const msg = await insert('coach_messages', {
    thread_id: job.coach_thread_id, role: 'assistant', speaker: JOB_SPEAKER[job.kind] || 'teammate', status: 'done',
    reply_to: job.request_message_id, content: text + (sources.length ? '\n\nSources:\n' + sources.map((s: any) => `- [${s.title || 'Source'}](${s.url})`).join('\n') : ''),
    meta: { job_id: job.id, job_kind: job.kind, verified: job.kind === 'coach_verify', sources, queued_changes: queued.length ? queued : undefined, completion_of: job.input?.reply_message_id || undefined },
  });
  const out = await adminUpdate('team_jobs', job.id, { status: 'completed', result_message_id: msg.id, updated_at: now, completed_at: now });
  await adminRest(`coach_threads?id=eq.${job.coach_thread_id}`, { method: 'PATCH', body: JSON.stringify({ updated_at: now }) }).catch(() => {});
  await metric({ user_id: job.owner_id, speaker: JOB_SPEAKER[job.kind], kind: job.kind, model: data.model || null, total_ms: Date.now() - new Date(job.created_at).getTime(), chars: text.length, credits: job.credits, ok: true });
  await notify(job, 'completed');
  return out;
}

/** A drawing set started from the chat runs in Draw it up; it is done when a newer set (or revision) is saved. */
async function advanceDrawing(job: any) {
  const since = job.created_at;
  const filter = job.input?.set_id ? `or=(id.eq.${job.input.set_id},project_thread_id.eq.${job.project_thread_id || '00000000-0000-0000-0000-000000000000'})` : job.project_thread_id ? `project_thread_id=eq.${job.project_thread_id}` : `coach_thread_id=eq.${job.coach_thread_id}`;
  const r = await adminRest(`drawing_generations?owner_id=eq.${job.owner_id}&${filter}&updated_at=gt.${encodeURIComponent(since)}&select=id,title,created_at,updated_at&order=updated_at.desc&limit=1`);
  const found = r.ok ? ((await r.json()) || [])[0] : null;
  const now = new Date().toISOString();
  if (found) {
    const claimed = await adminUpdate('team_jobs', job.id, { status: 'finishing', updated_at: now }, 'status=eq.running').catch(() => null);
    if (!claimed) return job;
    const msg = await insert('coach_messages', { thread_id: job.coach_thread_id, role: 'assistant', speaker: 'teammate', status: 'done', reply_to: job.request_message_id,
      content: `The drawing set **${found.title}** was updated in Draw it up. Open it to review the new sheets and the redlines against the previous version.`, meta: { job_id: job.id, job_kind: 'drawing_set', set_id: found.id } });
    await notify(job, 'completed');
    return adminUpdate('team_jobs', job.id, { status: 'completed', result_message_id: msg.id, updated_at: now, completed_at: now });
  }
  if (Date.now() - new Date(since).getTime() > DRAWING_WAIT_MS) return adminUpdate('team_jobs', job.id, { status: 'failed', error: 'No updated set was saved. If Draw it up is still working, check Your drawing sets.', updated_at: now, completed_at: now }, 'status=eq.running').catch(() => job);
  return job;
}

async function notify(job: any, how: 'completed' | 'failed') {
  try {
    await adminRest('drawup_notifications', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      user_id: job.owner_id, kind: 'team_job', ref_id: job.id, href: `#portal/ai-team?thread=${job.coach_thread_id}`,
      title: `${SPEAKER_NAME[JOB_SPEAKER[job.kind] || 'teammate']}: ${job.title}`, body: how === 'completed' ? 'Ready in your AI Design Team thread.' : 'Did not finish. Credits returned; you can retry.',
    }) });
  } catch { /* notifications are a convenience */ }
}

export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const q = new URL(request.url).searchParams;
  const threadId = q.get('thread_id') || '';
  let list: any[] = [];
  if (threadId) {
    if (!(await threadFor(user.id, threadId))) return json({ error: 'Not your conversation.' }, 403);
    const r = await adminRest(`team_jobs?owner_id=eq.${user.id}&coach_thread_id=eq.${threadId}&select=${COLS},owner_id,response_id,access,action&order=created_at&limit=60`);
    if (!r.ok) return json({ jobs: [], missing: true });
    list = await r.json();
  } else {
    const r = await adminRest(`team_jobs?owner_id=eq.${user.id}&or=(status.in.(running,finishing),completed_at.gt.${new Date(Date.now() - 86400000).toISOString()})&select=${COLS},owner_id,response_id,access,action&order=created_at.desc&limit=30`);
    if (!r.ok) return json({ jobs: [], missing: true });
    list = await r.json();
  }
  // Advance at most 4 running jobs per call (each is one quick status read).
  let n = 0;
  for (let i = 0; i < list.length; i++) if (list[i].status === 'running' && n++ < 4) list[i] = { ...list[i], ...(await advance(list[i]).catch(() => list[i])) };
  return json({ jobs: list.map(clean) });
}

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in first.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: notReady }, 503);
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '');
  const jobId = String(body?.job_id || '');

  if (action === 'track_drawing') {
    // The member approved a change and Draw it up is regenerating the set; follow it in the thread.
    const thread = await threadFor(user.id, String(body?.thread_id || ''));
    if (!thread) return json({ error: 'Not your conversation.' }, 403);
    const key = 'drawing_set:' + String(body?.request_id || '').slice(0, 64);
    const existing = await adminSelectOne<any>('team_jobs', `owner_id=eq.${user.id}&idempotency_key=eq.${encodeURIComponent(key)}&select=${COLS}`).catch(() => null);
    if (existing) return json({ job: existing });
    const project = await projectFor(user.id, thread.project_thread_id || String(body?.project_id || ''));
    const job = await insert('team_jobs', { owner_id: user.id, coach_thread_id: thread.id, project_thread_id: project?.id || null, request_message_id: UUID_RE.test(String(body?.message_id || '')) ? body.message_id : null,
      kind: 'drawing_set', speaker: 'teammate', title: JOB_TITLE.drawing_set + (body?.set_title ? ': ' + String(body.set_title).slice(0, 80) : ''), status: 'running',
      input: { set_id: UUID_RE.test(String(body?.set_id || '')) ? body.set_id : null, comments: (Array.isArray(body?.comments) ? body.comments : []).slice(0, 12).map((c: any) => String(c).slice(0, 600)) }, idempotency_key: key, credits: 0 });
    return json({ job: clean(job) });
  }

  if (!UUID_RE.test(jobId)) return json({ error: 'Job id required.' }, 400);
  const job = await adminSelectOne<any>('team_jobs', `id=eq.${jobId}&owner_id=eq.${user.id}&select=*`);
  if (!job) return json({ error: 'Not your task.' }, 404);

  if (action === 'cancel') {
    if (job.status !== 'running') return json({ job: clean(job) });
    const claimed = await adminUpdate('team_jobs', job.id, { status: 'canceled', error: 'Canceled by you. Credits returned.', updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }, 'status=eq.running').catch(() => null);
    if (!claimed) return json({ job: clean(job) });
    if (job.response_id) { await openaiCancel(job.response_id); await refundOnce(user.id, job.access, job.action || 'team_job', job.response_id); }
    return json({ job: clean(claimed), refunded: !!job.response_id && job.credits > 0 });
  }

  if (action === 'amend') {
    // A running AI job can't be changed mid-flight; the change is queued and shown with the result as the next revision.
    const change = String(body?.change || '').trim().slice(0, 600);
    if (!change) return json({ error: 'Write the change first.' }, 400);
    const queued = [...(job.queued_changes || []), change].slice(-10);
    const out = await adminUpdate('team_jobs', job.id, { queued_changes: queued, updated_at: new Date().toISOString() });
    return json({ job: clean(out), applied_to_running_job: false, queued_for_next_revision: true });
  }

  if (action === 'retry' || action === 'revise') {
    // Retry a failed / canceled job, or run the next revision of a finished one with its queued changes.
    if (action === 'retry' && !['failed', 'canceled'].includes(job.status)) return json({ error: 'Only a failed or canceled task can be retried.' }, 400);
    if (action === 'revise' && job.status !== 'completed') return json({ error: 'Wait for the task to finish first.' }, 400);
    if (job.kind === 'drawing_set') return json({ error: 'Retry this from Draw it up.' }, 400);
    const thread = await threadFor(user.id, job.coach_thread_id);
    if (!thread) return json({ error: 'Not your conversation.' }, 403);
    const key = `${job.kind}:${action}:${job.id}:${String(body?.request_id || '').slice(0, 40)}`;
    const dupe = await adminSelectOne<any>('team_jobs', `owner_id=eq.${user.id}&idempotency_key=eq.${encodeURIComponent(key)}&select=${COLS}`).catch(() => null);
    if (dupe) return json({ job: dupe });
    const costs = teamCosts();
    const cost = job.kind === 'coach_verify' ? Number(job.credits || costs.coach_code) : job.kind === 'sixth_man_shot' ? costs.shot : costs.layout;
    const access: CreditAccess = await reserveCredits(user, cost, 'team_' + job.kind);
    if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
    const project = await projectFor(user.id, thread.project_thread_id);
    const ctx = await loadContext(user.id, thread, project, true);
    const extra = action === 'revise' ? (job.queued_changes || []).join('; ') : '';
    const p = jobPrompt(job.kind, { question: String(job.input?.question || ''), ctx, extra, location: project?.location || '' });
    const payload: any = { instructions: p.instructions, input: p.input, background: true, store: true, max_output_tokens: 6000 };
    if (job.kind === 'coach_verify') payload.tools = [{ type: 'web_search' }];
    let created: any;
    try { created = (await openaiCreate(payload, jobModels(job.kind))).data; }
    catch (e: any) { await refundOnce(user.id, access, 'team_' + job.kind, 'start:' + key); return json({ error: (e?.message || 'Could not start.') + ' You were not charged.' }, 502); }
    const fresh = await insert('team_jobs', { owner_id: user.id, coach_thread_id: job.coach_thread_id, project_thread_id: job.project_thread_id, request_message_id: job.request_message_id,
      kind: job.kind, speaker: job.speaker, title: job.title + (action === 'revise' ? ' (revision)' : ''), status: 'running', response_id: created?.id || null,
      input: { ...job.input, revision_of: job.id }, action: 'team_' + job.kind, access, credits: cost, idempotency_key: key });
    if (action === 'revise') await adminUpdate('team_jobs', job.id, { queued_changes: [], updated_at: new Date().toISOString() }).catch(() => {});
    return json({ job: clean(fresh) });
  }
  return json({ error: 'Unknown action.' }, 400);
}
