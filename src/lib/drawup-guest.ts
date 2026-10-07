// V21: guest (not signed in) Arch Coach questions are capped at 10 per device and per network, so a
// new private window or cleared browser does not reset them. Only one-way hashes are stored.
import { createHmac } from 'node:crypto';
import { adminRpc } from '@/lib/drawup-server';

export const GUEST_LIMIT = Math.max(1, Number(process.env.DRAWUP_GUEST_LIMIT || 10));
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.OPENAI_API_KEY || 'drawup-guest';
const h = (kind: string, v: string) => kind + ':' + createHmac('sha256', SECRET).update(kind + '|' + v).digest('base64url').slice(0, 32);

/** The device id, browser fingerprint and network address of this request, as hashed quota keys. */
export function guestKeys(request: Request): string[] {
  const hd = request.headers;
  const device = (hd.get('x-drawup-device') || '').replace(/[^\w-]/g, '').slice(0, 80);
  const fp = (hd.get('x-drawup-fp') || '').replace(/[^\w-]/g, '').slice(0, 80);
  const ip = (hd.get('x-nf-client-connection-ip') || hd.get('cf-connecting-ip') || (hd.get('x-forwarded-for') || '').split(',')[0] || hd.get('x-real-ip') || '').trim().slice(0, 64);
  const keys: string[] = [];
  if (device.length >= 8) keys.push(h('d', device));
  if (fp.length >= 8) keys.push(h('f', fp));
  if (ip) keys.push(h('n', ip));
  return keys;
}

/** Takes one guest question for all keys. Returns the questions left, or -1 when the limit is reached. */
export async function reserveGuest(keys: string[]): Promise<number> {
  if (!keys.length) return GUEST_LIMIT - 1;
  return Number(await adminRpc<number>('reserve_guest_quota', { p_keys: keys, p_limit: GUEST_LIMIT }));
}

export async function refundGuest(keys: string[] | undefined) {
  if (!keys?.length) return;
  try { await adminRpc('refund_guest_quota', { p_keys: keys }); } catch (e) { console.error('[drawup] guest refund failed', e); }
}

export async function guestLeft(keys: string[]): Promise<number> {
  if (!keys.length) return GUEST_LIMIT;
  try { return Number(await adminRpc<number>('guest_quota_left', { p_keys: keys, p_limit: GUEST_LIMIT })); } catch { return GUEST_LIMIT; }
}
