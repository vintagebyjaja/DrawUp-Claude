import { NextResponse } from 'next/server';
import { creditMessage, isHqAccount, missingConfig, models as modelList, openaiCreate, outputText, refundCredits, reserveCredits, signTicket, signedInUser, type CreditAccess } from '@/lib/drawup-server';
import { legendFor, legendPrompt } from '@/lib/drawup-coach-persona';
import { streamCreate, withoutSpeedHints } from '@/lib/drawup-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V21 Hall of Fame: after Arch Coach answers, the member can ask an unlocked legend for a second opinion.
// The member keeps their own coach; the legend only comments on the answer. Charged like a basic question,
// streamed like every Arch Coach answer, and read back through GET /api/arch-coach?ticket=…
export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof signedInUser>> = null;
  let access: CreditAccess | null = null;
  const action = 'legend_opinion';
  try {
    user = await signedInUser(request);
    if (!user || user.is_anonymous) return NextResponse.json({ error: 'Sign in to ask a Hall of Fame legend.' }, { status: 401 });
    const notReady = missingConfig();
    if (notReady) return NextResponse.json({ error: 'Arch Coach is not connected yet: ' + notReady }, { status: 503 });
    const body = await request.json().catch(() => ({}));
    const key = String(body?.legend || '');
    const question = String(body?.question || '').trim();
    const answer = String(body?.answer || '').trim();
    if (!question || !answer) return NextResponse.json({ error: 'Ask Arch Coach first, then ask a legend about the answer.' }, { status: 400 });
    const hq = await isHqAccount(user.id);
    const { legend, unlocked, xp } = await legendFor(user.id, key, hq);
    if (!legend) return NextResponse.json({ error: 'That legend is not in the Hall of Fame.' }, { status: 404 });
    if (!unlocked) return NextResponse.json({ error: `${legend.name} unlocks at ${legend.xp_required} XP. You have ${xp} XP.`, code: 'LEGEND_LOCKED' }, { status: 403 });

    access = await reserveCredits(user, 3, action);
    if (!access.ok) return NextResponse.json({ error: creditMessage(access, 3), ...access }, { status: 402 });

    const payload = { input: legendPrompt(legend, question, answer, ''), max_output_tokens: 900 };
    const models = modelList(process.env.DRAWUP_COACH_MODEL, process.env.DRAWUP_SEARCH_MODEL, 'gpt-5.6-sol');
    let data: any = null;
    try { data = await streamCreate({ ...payload, reasoning: { effort: 'low' } }, models); }
    catch (e: any) { if (/reasoning/i.test(e?.message || '')) data = await streamCreate(withoutSpeedHints(payload), models).catch(() => null); }
    const label = { key: legend.key, name: legend.name, kind: legend.kind };
    if (data?.id) {
      const ticket = signTicket({ id: data.id, uid: user.id, action, research: false, s: 1, access: { ok: access.ok, hq: access.hq, access_type: access.access_type, monthly_used: access.monthly_used, purchased_used: access.purchased_used, is_anonymous: false, credits_charged: access.credits_charged, credits_remaining: access.credits_remaining } });
      return NextResponse.json({ ticket, status: data.status || 'queued', stream: { cursor: data.cursor || 0 }, legend: label });
    }
    const sync = (await openaiCreate(payload, models)).data;
    const text = outputText(sync);
    if (!text) { await refundCredits(user.id, access, action); return NextResponse.json({ error: 'The legend opinion came back empty. You were not charged.' }, { status: 502 }); }
    return NextResponse.json({ answer: text, legend: label, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
  } catch (error: any) {
    console.error('Legend opinion error', error);
    if (user && access) await refundCredits(user.id, access, action);
    return NextResponse.json({ error: error?.message || 'The legend opinion failed. You were not charged.' }, { status: 500 });
  }
}
