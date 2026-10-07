import { NextResponse } from 'next/server';
import {
  PRIVATE_BUCKET, adminRest, adminSelectOne, bytesToBase64, creditMessage, missingConfig, models,
  openaiCreate, openaiGet, outputText, pathIsOwn, readTicket, refundOnce, reserveCredits, signTicket,
  signedInUser, storageDownload, type CreditAccess,
} from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DrawUp Playbook Verify: Arch Coach grades a member's Practice work against the lesson rubric.
// POST starts the grading as a background AI job and returns a signed ticket. GET polls the ticket
// and, when the grade is ready, stores it in playbook_attempts with the service role (members can
// never write grades themselves). A pass (score 70+) unlocks Complete, which the member then claims
// through the playbook_complete database function. Failed jobs are refunded once.

const PASS = 70;
const MAX_IMAGE = 8 * 1024 * 1024;
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'found', 'missing', 'feedback', 'next_steps'],
  properties: {
    score: { type: 'integer' },
    found: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' } },
    feedback: { type: 'string' },
    next_steps: { type: 'array', items: { type: 'string' } },
  },
};
const INSTRUCTIONS = `You are Arch Coach grading a DrawUp Playbook practice submission for an architecture, engineering or construction learner.
Grade ONLY against the rubric items given. An item counts as found only when the submission clearly shows or states it.
Return score 0-100 (share of rubric items found, adjusted down for anything technically wrong), found and missing as rubric item texts,
feedback of 2-5 sentences that is specific, encouraging and professionally accurate, and up to 3 next_steps.
Never invent code section numbers. If you mention a code or standard, name it and say to verify the adopted edition.
If the submission is empty, off topic or unreadable, score it 0 and say why.`;

type Ticket = { rid: string; uid: string; lesson: string; access: CreditAccess; path?: string | null; answer: string; t: number };

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const miss = missingConfig();
  if (miss) return bad(miss, 500);
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return bad('Sign in to have Arch Coach verify your work.', 401);
  const body = await request.json().catch(() => ({}));
  const lessonId = String(body?.lesson_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) return bad('Unknown lesson.');
  const lesson = await adminSelectOne<any>('playbook_lessons', `id=eq.${lessonId}&status=eq.published&select=id,title,kind,practice,scenario,rubric,learn`);
  if (!lesson) return bad('That lesson is not published.', 404);
  const answer = String(body?.answer || '').slice(0, 6000).trim();
  const path = typeof body?.image_path === 'string' && body.image_path ? String(body.image_path) : null;
  if (path && !pathIsOwn(path, user.id)) return bad('That file is not yours.', 403);
  if (answer.length < 10 && !path) return bad('Add your answer or a drawing first (Practice), then Verify.');

  let image = '';
  if (path) {
    const file = await storageDownload(PRIVATE_BUCKET, path).catch(() => null);
    if (!file) return bad('Your drawing could not be read. Upload it again.');
    if (file.bytes.byteLength > MAX_IMAGE) return bad('Use an image under 8 MB.');
    if (!/^image\/(png|jpeg|webp)/.test(file.type)) return bad('Upload a PNG, JPG or WebP image.');
    image = `data:${file.type.split(';')[0]};base64,` + bytesToBase64(file.bytes);
  }

  const cost = image ? 8 : 3;
  const access = await reserveCredits(user, cost, 'playbook_verify');
  if (!access.ok) return NextResponse.json({ error: creditMessage(access, cost), ...access }, { status: 402 });

  const text = [
    'DRAWUP PLAYBOOK GRADER',
    `Lesson: ${lesson.title} (${lesson.kind})`,
    lesson.scenario ? `Scenario: ${lesson.scenario}` : '',
    `Task: ${lesson.practice || ''}`,
    'RUBRIC:',
    ...(lesson.rubric || []).map((r: string) => '- ' + r),
    'STUDENT ANSWER:',
    answer || '(drawing only, see the attached image)',
  ].filter(Boolean).join('\n');
  try {
    const content: any[] = [{ type: 'input_text', text }];
    if (image) content.push({ type: 'input_image', image_url: image });
    const { data } = await openaiCreate({
      instructions: INSTRUCTIONS,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name: 'drawup_playbook_grade', strict: true, schema: SCHEMA } },
      background: true, store: true,
    }, models(process.env.DRAWUP_PLAYBOOK_MODEL, process.env.DRAWUP_COACH_MODEL));
    const ticket = signTicket({ rid: data.id, uid: user.id, lesson: lesson.id, access, path, answer: answer.slice(0, 4000), t: Date.now() } as Ticket);
    return NextResponse.json({ ticket, status: data.status || 'queued' });
  } catch (e: any) {
    await refundOnce(user.id, access, 'playbook_verify', 'start-' + Date.now());
    return bad((e?.message || 'Arch Coach could not start grading.') + ' You were not charged.', 502);
  }
}

export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return bad('Sign in first.', 401);
  const t = readTicket<Ticket>(new URL(request.url).searchParams.get('ticket') || '');
  if (!t || t.uid !== user.id) return bad('That grading job is not yours.', 403);
  const rid = encodeURIComponent(t.rid);
  const saved = await adminSelectOne<any>('playbook_attempts', `response_id=eq.${rid}&select=*`);
  if (saved) return NextResponse.json({ status: 'completed', attempt: saved, pass_mark: PASS });
  let job: any;
  try { job = await openaiGet(t.rid); } catch (e: any) { return bad(e?.message || 'Grading status unavailable.', 502); }
  if (job.status === 'queued' || job.status === 'in_progress') {
    if (Date.now() - t.t > 3 * 60 * 1000) { await refundOnce(user.id, t.access, 'playbook_verify', t.rid); return bad('Grading took too long and was stopped. You were not charged.', 504); }
    return NextResponse.json({ status: job.status });
  }
  if (job.status !== 'completed') {
    await refundOnce(user.id, t.access, 'playbook_verify', t.rid);
    return bad('Arch Coach could not grade that. You were not charged.', 502);
  }
  let g: any;
  try { g = JSON.parse(outputText(job)); } catch { await refundOnce(user.id, t.access, 'playbook_verify', t.rid); return bad('The grade came back unreadable. You were not charged.', 502); }
  const score = Math.max(0, Math.min(100, Math.round(Number(g.score) || 0)));
  const row = {
    user_id: user.id, lesson_id: t.lesson, answer: t.answer || null, image_path: t.path || null, score, passed: score >= PASS,
    found: (g.found || []).map(String).slice(0, 40), missing: (g.missing || []).map(String).slice(0, 40),
    feedback: [String(g.feedback || ''), ...(g.next_steps || []).map((s: string) => 'Next: ' + s)].join('\n').slice(0, 4000),
    model: job.model || null, response_id: t.rid,
  };
  const r = await adminRest('playbook_attempts?on_conflict=response_id', { method: 'POST', headers: { Prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify(row) });
  const ins = r.ok ? (await r.json())[0] : null;
  const attempt = ins || await adminSelectOne<any>('playbook_attempts', `response_id=eq.${rid}&select=*`);
  if (!attempt) return bad('The grade could not be saved. Try Verify again.', 500);
  return NextResponse.json({ status: 'completed', attempt, pass_mark: PASS });
}
