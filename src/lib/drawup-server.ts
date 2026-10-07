// Server-only helpers shared by the DrawUp API routes (Arch Coach, Check, Swap).
// Nothing here is ever sent to the browser: it uses the Supabase service role and
// the OpenAI key, so it must only be imported from src/app/api/**.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
// Overridable so the whole flow can be tested against a local stand-in.
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

export const PRIVATE_BUCKET = 'drawup-private';

export type DrawUpUser = { id: string; email?: string; is_anonymous?: boolean };

export function missingConfig(): string | null {
  if (!SB_URL || !SB_ANON) return 'Supabase is not configured on the server.';
  if (!SB_SERVICE) return 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.';
  if (!OPENAI_KEY) return 'OPENAI_API_KEY is not set on the server.';
  return null;
}

/** The Supabase user behind the request's Bearer token, or null. */
export async function signedInUser(request: Request): Promise<DrawUpUser | null> {
  const auth = request.headers.get('authorization') || '';
  if (!SB_URL || !SB_ANON || !auth.startsWith('Bearer ') || auth.length < 20) return null;
  const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: auth }, cache: 'no-store' });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u?.id ? { id: u.id, email: u.email, is_anonymous: !!u.is_anonymous } : null;
}

/** PostgREST call with the service role (bypasses RLS — always filter by owner yourself). */
export async function adminRest(path: string, init: RequestInit = {}) {
  return fetch(SB_URL + '/rest/v1/' + path, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: SB_SERVICE,
      Authorization: 'Bearer ' + SB_SERVICE,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
}

export async function adminRpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await adminRest('rpc/' + fn, { method: 'POST', body: JSON.stringify(args) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.message || `${fn} failed (${r.status})`);
  return body as T;
}

export async function adminSelectOne<T = any>(table: string, query: string): Promise<T | null> {
  const r = await adminRest(`${table}?${query}&limit=1`);
  if (!r.ok) throw new Error(`Could not read ${table}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

/** PATCH one row by id. `onlyIf` adds filters (e.g. "status=eq.queued") so a state
 *  change happens once even when two requests race; returns undefined if nothing matched. */
export async function adminUpdate(table: string, id: string, fields: Record<string, unknown>, onlyIf = '') {
  const r = await adminRest(`${table}?id=eq.${encodeURIComponent(id)}${onlyIf ? '&' + onlyIf : ''}`, { method: 'PATCH', body: JSON.stringify(fields) });
  if (!r.ok) throw new Error(`Could not update ${table}: ${await r.text()}`);
  return (await r.json())[0];
}

export async function storageDownload(bucket: string, path: string): Promise<{ bytes: ArrayBuffer; type: string }> {
  const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`The uploaded file could not be read (${r.status}).`);
  return { bytes: await r.arrayBuffer(), type: r.headers.get('content-type') || 'application/octet-stream' };
}

export async function storageUpload(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: bytes as unknown as BodyInit,
  });
  if (!r.ok) throw new Error(`The result could not be saved (${r.status}): ${await r.text()}`);
}

/* ------------------------------------------------------------------ credits */

export type CreditAccess = {
  ok: boolean;
  access_type?: string;
  credits_charged?: number;
  credits_remaining?: number;
  monthly_used?: number;
  purchased_used?: number;
  code?: string;
  hq?: boolean;
  is_anonymous?: boolean;
};

async function isHqAccount(userId: string) {
  const p = await adminSelectOne<{ account_type: string }>('profiles', `id=eq.${userId}&select=account_type`);
  return p?.account_type === 'founder' || p?.account_type === 'drawup_admin';
}

/**
 * Takes the credits for one action BEFORE the AI runs (the 0013 server gate).
 * DrawUp HQ accounts (founder / drawup_admin) are not charged.
 */
export async function reserveCredits(user: DrawUpUser, cost: number, action: string): Promise<CreditAccess> {
  if (await isHqAccount(user.id)) return { ok: true, access_type: 'hq', credits_charged: 0, hq: true };
  const access = await adminRpc<CreditAccess>('reserve_arch_coach_v11_access', {
    p_user_id: user.id,
    p_is_anonymous: !!user.is_anonymous,
    p_cost: cost,
    p_action: action,
    p_thread_id: null,
  });
  return { ...access, is_anonymous: !!user.is_anonymous };
}

/** Gives the credits back when the AI step fails (the 0016 refund). Never throws. */
export async function refundCredits(userId: string, access: CreditAccess | null | undefined, action: string) {
  if (!access?.ok || access.hq || !access.access_type) return;
  try {
    await adminRpc('refund_arch_coach_v13_access', {
      p_user_id: userId,
      p_is_anonymous: !!access.is_anonymous,
      p_monthly_used: Number(access.monthly_used || 0),
      p_purchased_used: Number(access.purchased_used || 0),
      p_action: action,
    });
  } catch (e) {
    console.error('[drawup] refund failed', action, e);
  }
}

export function creditMessage(access: CreditAccess, cost: number) {
  if (access.code === 'INSUFFICIENT_CREDITS') return `This needs ${cost} credits and you have ${access.credits_remaining ?? 0}. Add credits from Account to continue.`;
  if (access.code === 'GUEST_LIMIT_REACHED') return 'Your guest questions are used. Create a free DrawUp account to keep going.';
  return 'Your DrawUp allowance does not cover this action.';
}

/* ------------------------------------------------------------------ OpenAI */

export function models(...preferred: (string | undefined)[]) {
  return [...new Set([...preferred, 'gpt-5'].filter(Boolean))] as string[];
}

/** POST /responses, trying each model until one is accepted. */
export async function openaiCreate(payload: Record<string, unknown>, modelList: string[]) {
  let last = 'The AI request failed.';
  for (const model of modelList) {
    const r = await fetch(OPENAI_BASE + '/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, model }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return { data, model };
    last = data?.error?.message || `The AI service returned ${r.status}.`;
    // Only fall through to the next model when this one is unknown/unavailable.
    if (![400, 404].includes(r.status) || !/model/i.test(last)) break;
  }
  throw new Error(last);
}

export async function openaiGet(id: string) {
  const r = await fetch(`${OPENAI_BASE}/responses/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${OPENAI_KEY}` },
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message || `The AI service returned ${r.status}.`);
  return data;
}

export function outputText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  return (data?.output || [])
    .flatMap((o: any) => o?.content || [])
    .filter((c: any) => c?.type === 'output_text' || typeof c?.text === 'string')
    .map((c: any) => c?.text || '')
    .join('\n')
    .trim();
}

export function sourcesFrom(data: any) {
  const found: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      for (const ann of content?.annotations || []) {
        const c = ann?.url_citation || ann;
        const url = c?.url;
        if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
          seen.add(url);
          found.push({ title: c?.title || 'Source', url });
        }
      }
    }
  }
  return found.slice(0, 12);
}

export function bytesToBase64(bytes: ArrayBuffer | Uint8Array) {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64');
}

/** Owner folder check for storage paths ("<uid>/..."), mirrors storage_path_is_own() in SQL. */
export function pathIsOwn(path: string, userId: string) {
  return typeof path === 'string' && path.split('/')[0] === userId && !path.includes('..');
}

/* ------------------------------------------------------------------ background job tickets */
/** Signs a small JSON payload so a background job can only be read (and refunded) by the user who started it. */
export function signTicket(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', SB_SERVICE || OPENAI_KEY || 'drawup').update(body).digest('base64url');
  return body + '.' + mac;
}
export function readTicket<T = any>(ticket: string): T | null {
  const [body, mac] = String(ticket || '').split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', SB_SERVICE || OPENAI_KEY || 'drawup').update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}

/** Refunds a background job at most once, using the credit ledger as the record. Never throws. */
export async function refundOnce(userId: string, access: CreditAccess | null | undefined, action: string, jobId: string) {
  if (!access?.ok || access.hq || !access.access_type) return;
  const tag = action + ':' + jobId;
  try {
    const seen = await adminRest(`arch_coach_credit_ledger?user_id=eq.${userId}&metadata->>action=eq.${encodeURIComponent(tag)}&select=id&limit=1`);
    if (seen.ok && (await seen.json()).length) return;
    await refundCredits(userId, access, tag);
    if (access.is_anonymous) await adminRest('arch_coach_credit_ledger', { method: 'POST', body: JSON.stringify({ user_id: userId, delta: 0, reason: 'arch_coach_guest_refund', metadata: { action: tag } }) });
  } catch (e) {
    console.error('[drawup] refundOnce failed', tag, e);
  }
}

export async function openaiCancel(id: string) {
  try { await fetch(`${OPENAI_BASE}/responses/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}` } }); } catch {}
}
