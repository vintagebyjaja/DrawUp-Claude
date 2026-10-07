import { NextResponse } from 'next/server';
import { creditMessage, missingConfig, models as modelList, openaiCancel, openaiCreate, openaiGet, outputText, readTicket, refundCredits, refundOnce, reserveCredits, signTicket, signedInUser, sourcesFrom, type CreditAccess } from '@/lib/drawup-server';
import { quickCall, quickCoachPrompt, type QuickResult } from '@/lib/drawup-quick';
import { createHash } from 'node:crypto';
import { recordDetailQuery, recordDetailSources } from '@/lib/drawup-details';
import { awardXp, coachPersona } from '@/lib/drawup-coach-persona';
import { guestKeys, guestLeft, reserveGuest, GUEST_LIMIT } from '@/lib/drawup-guest';
import { streamCreate, streamRead, withoutSpeedHints } from '@/lib/drawup-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function needsCurrentResearch(text: string) {
  return /\b(zoning|udo|code|building code|ibc|ada|accessib|permit|ordinance|jurisdiction|occupancy|egress|fire code|energy code|amendment|planning|historic district|setback|parking requirement|architect|engineer|firm|project|product|manufacturer|standard|nfpa|ashrae|icc)\b/i.test(text);
}

// Arch Coach spends the server's AI key, so only signed-in DrawUp sessions may call it,
// and every answered question is charged through the same credit gate as the
// Supabase edge function (reserve before the AI runs, refund if it fails).
function questionCost(text: string, hasImage: boolean) {
  if (hasImage) return { action: 'plan_analysis', cost: 30 };
  if (/\bibc\b|\bicc\b|\bada\b|accessib|building code|egress|occupancy|fire rating|code section|zoning/i.test(text)) return { action: 'code_ada_question', cost: 8 };
  return { action: 'basic_question', cost: 3 };
}

const STATES = 'al|ak|az|ar|ca|co|ct|de|dc|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|ontario|quebec|british columbia|alberta|canada|mexico|uk|united kingdom|england|usa|us';
// "City, ST" / "City, State" / "City, Country" in any letter case, e.g. "richmond, va".
const PLACE = new RegExp(`\\b[a-z][a-z .'-]{1,40},\\s*(?:${STATES})\\b`, 'i');

/**
 * Builds the full Arch Coach prompt. Keep ALL coach prompt text here: personalization
 * (src/lib/drawup-coach-persona.ts, added later) hooks in by extending `extra`.
 */
export function buildCoachPrompt({ message, transcript, location, extra = '' }: { message: string; transcript: string; location: string; extra?: string }) {
  const instructions = `You are Arch Coach, DrawUp's AEC copilot. Be useful, concise, professional, and practical. Preserve context from the entire conversation. Never ask for information the user already supplied in the conversation. If a user gives a location as a follow-up, connect it to the earlier question automatically. For jurisdiction-specific zoning, code, ADA, permitting, standards, firms, projects, products, or other current facts, research current sources and answer from them. Prefer official government/AHJ/code/institutional sources first, then authoritative AEC sources. Clearly distinguish a binding requirement from guidance or a recommendation. Do not claim a design is code compliant; note that final interpretation/approval belongs to the applicable licensed professionals and AHJ when relevant. Do not tell the user to Google something. Answer the question first, then give the useful details. Do not mention internal model names, API keys, credits, or implementation details.`;
  return `${instructions}${extra ? '\n\n' + extra : ''}\n\nCONVERSATION:\n${transcript || `USER: ${message}`}\n${location ? `\nPROJECT LOCATION: ${location}` : ''}\n\nRespond to the user's latest message in context.`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const QUICK_HEAD_START_MS = 3000;
const quickOut = (q: QuickResult | null) => q && q.kind === 'answer' ? { answer: q.answer, ms: q.ms, final: q.final === true, label: q.final ? 'Answer' : 'Quick answer, still checking sources' } : null;
const clarifyOut = (q: QuickResult) => q.kind === 'clarify' ? { question: q.question, options: q.options } : null;

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof signedInUser>> = null;
  let access: CreditAccess | null = null;
  let action = 'basic_question';
  try {
    user = await signedInUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in to use Arch Coach.' }, { status: 401 });
    const body = await request.json();
    const message = String(body?.message || '').trim();
    const location = String(body?.location || '').trim();
    const image = typeof body?.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(body.image) ? body.image : '';
    const history = (Array.isArray(body?.history) ? body.history : [])
      .filter((x: any) => (x?.role === 'user' || x?.role === 'assistant') && typeof x?.content === 'string')
      .slice(-16) as ChatTurn[];
    if (!message) return NextResponse.json({ error: 'Message required.' }, { status: 400 });
    await recordDetailQuery(message, 'arch_coach', user.id); // V21 Detail Library: detail questions land in the shared detail database

    const notReady = missingConfig();
    if (notReady) return NextResponse.json({ error: 'Arch Coach is not connected yet: ' + notReady }, { status: 503 });

    const transcript = history.map(t => `${t.role === 'user' ? 'USER' : 'ARCH COACH'}: ${t.content}`).join('\n');
    const combined = `${transcript}\nPROJECT LOCATION FIELD: ${location || '(not separately supplied)'}`;
    const research = needsCurrentResearch(combined);
    const jurisdictionSpecific = /\b(zoning|udo|building code|ibc|ada|permit|ordinance|jurisdiction|occupancy|egress|fire code|energy code|setback|parking requirement)\b/i.test(combined);
    // A location counts if it is in the field, anywhere in the conversation (any letter case, e.g. "richmond, va"),
    // or if Coach just asked where the project is and this message is the reply.
    const askedWhere = /where is the project located/i.test(history.filter(t => t.role === 'assistant').slice(-1)[0]?.content || '');
    const locationClue = Boolean(location) || (askedWhere && message.length <= 120) || PLACE.test(transcript) || PLACE.test(message) || /\b(?:in|at)\s+[A-Z][a-z]+/.test(transcript + '\n' + message);
    if (jurisdictionSpecific && !locationClue) {
      return NextResponse.json({ answer: 'Where is the project located (city, state/province, and country)? I need the project jurisdiction before I give you a zoning, code, accessibility, egress, or permitting answer.', sources: [], needs_location: true, researched: false });
    }
    // V20 speed: a fast call answers first (or asks one clarifying question with options) while the
    // full researched answer runs. A clarifying question found early is free; one found after the
    // full job started cancels that job and refunds it, so a question is never charged twice.
    const useQuick = !!body?.async && !image;
    const allowClarify = useQuick && !body?.clarified;
    // V20: the member's own Arch Coach (blueprint, skills, legend, language). Never blocks an answer.
    const persona = await coachPersona(user.id).catch(() => '');
    const quickP: Promise<QuickResult | null> = useQuick ? quickCall(quickCoachPrompt(transcript || `USER: ${message}`, location, allowClarify) + (persona ? `\nSTYLE GUIDANCE (keep the JSON format exactly as required):\n${persona}` : ''), allowClarify) : Promise.resolve(null);
    const early = useQuick ? await Promise.race([quickP, sleep(QUICK_HEAD_START_MS).then(() => undefined)]) : null;
    const clarifyReply = (q: QuickResult) => { const c = clarifyOut(q)!; return NextResponse.json({ answer: c.question, clarify: c, needs_clarification: true, sources: [], researched: false, credits_charged: 0 }); };
    if (early && early.kind === 'clarify') return clarifyReply(early);
    // V21.1: if the fast answer fully resolves a stable/simple question, stop here.
    // Do not launch an unnecessary full research job that can later fail and erase a good answer.
    if (early && early.kind === 'answer' && early.final === true && !research) {
      await awardXp(user.id, 'ask', 'quick:' + createHash('sha1').update(message + early.answer).digest('hex'));
      return NextResponse.json({ answer: early.answer, sources: [], researched: false, quick_final: true, credits_charged: 0, credits_remaining: null });
    }

    const priced = questionCost(message, !!image);
    action = priced.action;
    access = await reserveCredits(user, priced.cost, action);
    if (!access.ok) return NextResponse.json({ error: creditMessage(access, priced.cost), ...access }, { status: 402 });
    // V21: guests get 10 questions per device and network, not per browser session.
    if (user.is_anonymous && !access.hq) {
      const keys = guestKeys(request);
      const left = await reserveGuest(keys);
      if (left < 0) {
        await refundCredits(user.id, access, action);
        access = null;
        return NextResponse.json({ error: 'Your 10 free guest questions on this device are used. Create a free DrawUp account to keep going.', code: 'GUEST_LIMIT_REACHED', free_questions_remaining: 0 }, { status: 402 });
      }
      access.guest_keys = keys;
      access.free_questions_remaining = Math.min(left, Number.isInteger(access.free_questions_remaining) ? access.free_questions_remaining! : left);
    }
    if (image) await awardXp(user.id, 'upload', 'img:' + createHash('sha1').update(image).digest('hex'));

    const input = buildCoachPrompt({ message, transcript, location, extra: persona });
    const models = modelList(process.env.DRAWUP_COACH_MODEL, process.env.DRAWUP_SEARCH_MODEL, 'gpt-5.6-sol');
    const payload: any = image ? { input: [{ role: 'user', content: [{ type: 'input_text', text: input }, { type: 'input_image', image_url: image }] }] } : { input };
    if (research) payload.tools = [{ type: 'web_search' }];
    const done = (data: any) => NextResponse.json({ answer: outputText(data), sources: sourcesFrom(data), researched: research, credits_charged: access?.credits_charged ?? 0, credits_remaining: access?.credits_remaining ?? null, free_questions_remaining: access?.free_questions_remaining ?? null });

    // V20: answer as a background job so long researched answers never hit the host's request time limit.
    // The page polls GET ?ticket=… ; the ticket is signed so only this user can read or refund the job.
    if (body?.async) {
      try {
        // V21: stream the full answer so the page shows it as it is written. Falls back to a plain background job.
        let data: any = null, streamed = false;
        const fast = { ...payload, reasoning: { effort: 'low' } };
        try { data = await streamCreate(fast, models); streamed = true; }
        catch (e: any) {
          if (/reasoning/i.test(e?.message || '')) { try { data = await streamCreate(withoutSpeedHints(fast), models); streamed = true; } catch {} }
        }
        if (!data) data = (await openaiCreate({ ...payload, background: true, store: true }, models)).data;
        if (data?.status === 'completed' && outputText(data)) { await awardXp(user.id, 'ask', data.id || 'sync:' + Date.now()); return done(data); }
        const quick = early === undefined ? await quickP : early;
        // The quick answer may finish just after the 3s head start. If it says the answer is
        // already complete, cancel the unnecessary full job and return the useful answer.
        if (quick && quick.kind === 'answer' && quick.final === true && !research) {
          if (data?.id) await openaiCancel(data.id).catch(() => {});
          if (data?.id) await refundOnce(user.id, access, action, data.id);
          else await refundCredits(user.id, access, action);
          access = null;
          await awardXp(user.id, 'ask', 'quick:' + createHash('sha1').update(message + quick.answer).digest('hex'));
          return NextResponse.json({ answer: quick.answer, sources: [], researched: false, quick_final: true, credits_charged: 0, credits_remaining: null });
        }
        if (quick && quick.kind === 'clarify' && data?.id) {
          await openaiCancel(data.id);
          await refundOnce(user.id, access, action, data.id);
          return clarifyReply(quick);
        }
        if (data?.id) {
          const ticket = signTicket({ id: data.id, uid: user.id, action, research, s: streamed ? 1 : 0, access: { ok: access.ok, hq: access.hq, access_type: access.access_type, monthly_used: access.monthly_used, purchased_used: access.purchased_used, is_anonymous: access.is_anonymous, credits_charged: access.credits_charged, credits_remaining: access.credits_remaining, free_questions_remaining: access.free_questions_remaining, guest_keys: access.guest_keys } });
          return NextResponse.json({ ticket, status: data.status || 'queued', free_questions_remaining: access.free_questions_remaining ?? null, quick: quickOut(quick), stream: streamed ? { cursor: data.cursor || 0 } : null });
        }
      } catch (e: any) {
        if (!/background|store/i.test(e?.message || '')) throw e;
      }
    }
    const { data } = await openaiCreate(payload, models);
    if (!outputText(data)) {
      await refundCredits(user.id, access, action);
      return NextResponse.json({ error: 'Arch Coach returned an empty response. You were not charged.' }, { status: 502 });
    }
    await awardXp(user.id, 'ask', data?.id || 'sync:' + Date.now());
    return done(data);
  } catch (error: any) {
    console.error('Arch Coach API error', error);
    if (user && access) await refundCredits(user.id, access, action);
    return NextResponse.json({ error: error?.message || 'Arch Coach request failed.' }, { status: 500 });
  }
}

async function jobFor(request: Request) {
  const user = await signedInUser(request);
  const t = readTicket<{ id: string; uid: string; action: string; research: boolean; s?: number; access: CreditAccess }>(new URL(request.url).searchParams.get('ticket') || '');
  if (!user || !t || t.uid !== user.id) return null;
  return t;
}

export async function GET(request: Request) {
  // V21: how many guest questions this device has left (shown before the first question).
  if (new URL(request.url).searchParams.get('guest') === '1') {
    return NextResponse.json({ free_questions_remaining: await guestLeft(guestKeys(request)), limit: GUEST_LIMIT });
  }
  const t = await jobFor(request);
  if (!t) return NextResponse.json({ error: 'This Arch Coach answer belongs to another session.' }, { status: 403 });
  try {
    // V21: streamed jobs return the text written since the page's cursor, then the full answer at the end.
    const after = new URL(request.url).searchParams.get('after');
    if (t.s && after !== null) {
      let r;
      try { r = await streamRead(t.id, Number(after) || 0, 7000); } catch { r = null; }
      if (r && !r.final && !r.failed) return NextResponse.json({ status: 'in_progress', delta: r.text, cursor: r.cursor, activity: r.activity || null });
      if (r?.failed && !r.final) {
        await refundOnce(t.uid, t.access, t.action, t.id);
        return NextResponse.json({ error: 'Arch Coach could not finish that answer. You were not charged.' }, { status: 502 });
      }
      // finished (or the stream could not be read): fall through to the normal read of the stored answer
    }
    const data = await openaiGet(t.id);
    if (data.status === 'queued' || data.status === 'in_progress') return NextResponse.json({ status: data.status });
    const answer = data.status === 'completed' || data.status === 'incomplete' ? outputText(data) : '';
    if (!answer) {
      await refundOnce(t.uid, t.access, t.action, t.id);
      return NextResponse.json({ error: 'Arch Coach could not finish that answer. You were not charged.' }, { status: 502 });
    }
    await awardXp(t.uid, 'ask', t.id);
    await recordDetailSources('arch_coach', { userId: t.uid }, sourcesFrom(data)); // V21 Detail Library
    return NextResponse.json({ status: 'completed', answer, sources: sourcesFrom(data), researched: t.research, credits_charged: t.access?.credits_charged ?? 0, credits_remaining: t.access?.credits_remaining ?? null, free_questions_remaining: t.access?.free_questions_remaining ?? null });
  } catch (error: any) {
    return NextResponse.json({ status: 'in_progress', note: error?.message || 'Still checking.' });
  }
}

/** Stops a job the page gave up on (the two-minute limit) and refunds it once. */
export async function DELETE(request: Request) {
  const t = await jobFor(request);
  if (!t) return NextResponse.json({ error: 'Not your job.' }, { status: 403 });
  await openaiCancel(t.id);
  await refundOnce(t.uid, t.access, t.action, t.id);
  return NextResponse.json({ ok: true, refunded: true });
}
