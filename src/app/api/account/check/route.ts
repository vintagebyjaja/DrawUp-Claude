import { NextResponse } from 'next/server';
import { KIND_LABEL, precheck, ruleMessage } from '@/lib/drawup-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V22: called by the sign-up screen before an account is created. Says whether this email may be this
// person's next DrawUp account (one personal plus one school, firm or business email per person).
// It is advice for the page only: the real limit is enforced when credits are used (see drawup-server.ts).
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase().slice(0, 254);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ ok: false, code: 'invalid_email', message: ruleMessage('invalid_email') });
    }
    const r = await precheck(email, request);
    const ok = r.code === 'ok';
    return NextResponse.json({
      ok,
      code: r.code,
      kind: r.kind,
      kind_label: KIND_LABEL[r.kind] || 'email',
      message: ok ? `This will be your ${KIND_LABEL[r.kind] || 'email'} account.` : ruleMessage(r.code),
    });
  } catch (e) {
    console.error('[drawup] account check failed', e);
    // Never stop a sign up because the check itself failed; credits are still gated on the server.
    return NextResponse.json({ ok: true, code: 'unchecked', message: '' });
  }
}
