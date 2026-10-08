import { NextResponse } from 'next/server';
import { signedInUser } from '@/lib/drawup-server';
import { KIND_LABEL, allowance, linkAccount, ruleMessage } from '@/lib/drawup-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V22: the page calls this right after sign up and on every sign in. It records the hashed device keys
// for the account and checks the two account rule. Accounts that were never linked, or that break the
// rule, get no free questions, free credits, trials or plan credits (checked in reserveCredits).
export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (user.is_anonymous) return NextResponse.json({ ok: true, status: 'guest' });
  try {
    const r = await linkAccount(user.id, request);
    return NextResponse.json({
      ok: r.ok,
      status: r.status,
      kind: r.kind,
      kind_label: KIND_LABEL[r.kind] || 'email',
      code: r.reason,
      message: r.ok ? '' : 'This account has no free DrawUp credits. ' + ruleMessage(r.reason),
    });
  } catch (e: any) {
    console.error('[drawup] account link failed', e);
    return NextResponse.json({ error: 'Your account could not be checked right now. Please try again.' }, { status: 500 });
  }
}

/** The signed-in account's free allowance status, for the page. */
export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (user.is_anonymous) return NextResponse.json({ ok: true, status: 'guest' });
  try {
    const a = await allowance(user.id);
    return NextResponse.json({ ...a, message: a.ok ? '' : a.code === 'ACCOUNT_NOT_LINKED' ? 'Sign in on the DrawUp site to finish setting up this account.' : ruleMessage(a.reason) });
  } catch (e) {
    return NextResponse.json({ error: 'Status unavailable.' }, { status: 500 });
  }
}
