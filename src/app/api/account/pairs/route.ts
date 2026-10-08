import { NextResponse } from 'next/server';
import { adminRpc, adminSelectOne, signedInUser } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V22: read-only list for the DrawUp founder of hashed device ids / fingerprints used by more than one
// account. Only profiles.account_type = founder may read it. Keys are shown shortened and hashed.
export async function GET(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const p = await adminSelectOne<{ account_type: string }>('profiles', `id=eq.${user.id}&select=account_type`).catch(() => null);
  if (p?.account_type !== 'founder') return NextResponse.json({ error: 'Only the DrawUp founder can see this list.' }, { status: 403 });
  try {
    const rows = await adminRpc<any[]>('drawup_account_pairs', {});
    return NextResponse.json({ groups: rows || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'List unavailable.' }, { status: 500 });
  }
}
