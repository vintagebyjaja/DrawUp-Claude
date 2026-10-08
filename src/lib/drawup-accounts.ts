// V22: two DrawUp accounts per person — one personal email plus one school, firm or business email.
// "Same person" comes from the guest identity the page already sends (device id kept in storage and a
// cookie, plus a browser fingerprint). The fingerprint only counts together with the same network, so two
// strangers with the same phone model are not merged; set DRAWUP_ACCOUNT_FP_ALONE=1 to let the fingerprint
// count on its own. Only one-way hashes are stored (see src/lib/drawup-guest.ts).
import { adminRpc } from '@/lib/drawup-server';
import { guestKeys } from '@/lib/drawup-guest';

export const FP_ALONE = process.env.DRAWUP_ACCOUNT_FP_ALONE === '1';

export type EmailKind = 'personal' | 'school' | 'work' | 'invalid' | 'hq';

export const KIND_LABEL: Record<string, string> = {
  personal: 'personal email',
  school: 'school email',
  work: 'firm or business email',
  invalid: 'email',
  hq: 'DrawUp HQ',
};

/** Plain-language reason for each rule code. */
export function ruleMessage(code: string | undefined | null): string {
  switch (code) {
    case 'same_personal':
      return 'This device already has a personal DrawUp account. Your second account must use a school, firm or business email.';
    case 'same_work':
      return 'This device already has a school, firm or business DrawUp account. Your second account must use a personal email (for example Gmail, Outlook or iCloud).';
    case 'two_accounts':
      return 'This device already has two DrawUp accounts, one personal and one school, firm or business. Each person can have two, so please sign in to one of them.';
    case 'invalid_email':
      return 'Enter a full email address, like name@gmail.com or name@yourschool.edu.';
    default:
      return 'Each person can have two DrawUp accounts: one personal email and one school, firm or business email.';
  }
}

/** Hashed device id and fingerprint (plus network, used only to confirm a fingerprint match). */
export function accountKeys(request: Request) {
  return guestKeys(request);
}

export async function precheck(email: string, request: Request) {
  const keys = accountKeys(request);
  const r = await adminRpc<{ kind: EmailKind; code: string }>('drawup_account_precheck', { p_email: email, p_keys: keys, p_strict: FP_ALONE });
  return { ...r, recognised: keys.some(k => k.startsWith('d:') || k.startsWith('f:')) };
}

export async function linkAccount(userId: string, request: Request) {
  return adminRpc<{ ok: boolean; status: string; reason: string | null; kind: EmailKind; keys_seen: number }>('drawup_account_link', {
    p_user_id: userId,
    p_keys: accountKeys(request),
    p_strict: FP_ALONE,
  });
}

export async function allowance(userId: string) {
  return adminRpc<{ ok: boolean; status?: string; code?: string; reason?: string }>('drawup_account_allowance', { p_user_id: userId, p_strict: FP_ALONE });
}
