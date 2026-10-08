// Server-only helpers for the DrawUp HQ founder delete tools (src/app/api/hq/**).
// Every request is checked here against the signed-in token: only the profile whose
// account_type is 'founder' passes. drawup_admin, campus / organization managers, firm
// admins, students and members all get 403; signed-out callers get 401.

import { NextResponse } from 'next/server';
import { SB_URL, adminRest, adminRpc, adminSelectOne, signedInUser, type DrawUpUser } from '@/lib/drawup-server';

const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const BUCKETS = ['drawup-files', 'drawup-private', 'student-portfolios'];

export type Founder = { user: DrawUpUser; email: string };

export const bad = (error: string, status = 400) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Returns the founder, or a ready 401/403 response. Never trusts anything from the browser body. */
export async function requireFounder(request: Request): Promise<Founder | Response> {
  if (!SB_URL || !SB_SERVICE) return bad('Supabase is not configured on the server.', 500);
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return bad('Sign in with the DrawUp founder account.', 401);
  const p = await adminSelectOne<{ account_type: string }>('profiles', `id=eq.${user.id}&select=account_type`).catch(() => null);
  if (p?.account_type !== 'founder') return bad('Only the DrawUp founder account can do this.', 403);
  return { user, email: user.email || '' };
}

export async function audit(f: Founder, kind: string, targetId: string, label: string, detail: Record<string, unknown> = {}) {
  try {
    await adminRest('hq_audit', {
      method: 'POST',
      body: JSON.stringify({ actor_id: f.user.id, actor_label: f.email, kind, target_id: targetId, label: String(label || '').slice(0, 200), detail }),
    });
  } catch (e) {
    console.error('[drawup hq] audit failed', kind, targetId, e);
  }
}

/** Deletes Storage objects with the Storage API (SQL deletes on storage.objects are blocked). */
export async function storageRemove(bucket: string, names: string[]): Promise<string[]> {
  const removed: string[] = [];
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: chunk }),
    });
    if (!r.ok) throw new Error(`Storage refused the delete (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json().catch(() => []);
    for (const o of rows || []) if (o?.name) removed.push(bucket + '/' + o.name);
  }
  return removed;
}

export type FileRef = { bucket_id: string | null; name: string };

/** Removes the given files unless some remaining row still points at them (a shared firm logo,
 *  a project photo ...). A null bucket means "unknown bucket": every DrawUp bucket is tried. */
export async function removeUnusedFiles(files: FileRef[]) {
  const names = [...new Set(files.map(f => f.name).filter(Boolean))];
  if (!names.length) return { removed: [] as string[], kept: [] as string[] };
  const inUse = new Set(await adminRpc<string[]>('hq_paths_in_use', { p_names: names }).catch(() => names));
  const byBucket = new Map<string, Set<string>>();
  for (const f of files) {
    if (!f.name || inUse.has(f.name)) continue;
    for (const b of f.bucket_id ? [f.bucket_id] : BUCKETS) {
      if (!byBucket.has(b)) byBucket.set(b, new Set());
      byBucket.get(b)!.add(f.name);
    }
  }
  const removed: string[] = [];
  for (const [b, set] of byBucket) removed.push(...(await storageRemove(b, [...set])));
  return { removed, kept: [...inUse] };
}

const UUID_PATH = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^\s"'?#)<>]+)/gi;

/** Finds Storage paths mentioned anywhere in a row: public URLs (bucket known) and raw
 *  "<uuid>/..." paths kept in columns like storage_path or source_path (bucket unknown). */
export function filesInRow(row: unknown): FileRef[] {
  const out: FileRef[] = [];
  const text = JSON.stringify(row ?? '');
  for (const b of BUCKETS) {
    const re = new RegExp('/' + b.replace(/-/g, '\\-') + '/([^\\s"\'?#)<>]+)', 'g');
    for (const m of text.matchAll(re)) out.push({ bucket_id: b, name: decodeURIComponent(m[1]) });
  }
  const known = new Set(out.map(f => f.name));
  for (const m of text.matchAll(UUID_PATH)) if (!known.has(m[1]) && !/^https?:/i.test(m[1])) out.push({ bucket_id: null, name: decodeURIComponent(m[1]) });
  return out.filter(f => !f.name.includes('..'));
}

/* ------------------------------------------------------------------ content kinds */
// Everything members can publish or upload that the founder can remove. `label` columns are
// shown in HQ and written to the deletion log; `author` is the member column (when there is one).
export type Kind = {
  table: string; title: string; label: string; idType?: 'uuid' | 'int'; author?: string; order?: string;
  children?: { table: string; fk: string }[];
};
export const KINDS: Record<string, Kind> = {
  connect_post: { table: 'connect_posts', title: 'Connect post, board post or Playbook post', label: 'title,body,topic,kind,image_urls', author: 'author_id', order: 'created_at' },
  connect_comment: { table: 'connect_comments', title: 'Comment or reply', label: 'body', author: 'author_id', order: 'created_at' },
  chat_message: { table: 'connect_chat_messages', title: 'Chat message', label: 'body,image_url', author: 'author_id', order: 'created_at' },
  direct_message: { table: 'direct_messages', title: 'Direct message', label: 'body,image_url', idType: 'int', author: 'sender_id', order: 'created_at' },
  campus_post: { table: 'campus_posts', title: 'Campus board post', label: 'body,post_type,media_url', author: 'author_id', order: 'created_at' },
  detail: { table: 'details', title: 'Uploaded detail', label: 'title,category,preview_url', author: 'owner_id', order: 'created_at', children: [{ table: 'detail_assets', fk: 'detail_id' }] },
  detail_asset: { table: 'detail_assets', title: 'Detail file', label: 'file_name,storage_path', idType: 'int', author: 'owner_id', order: 'created_at' },
  detail_find: { table: 'detail_finds', title: 'AI-found community detail', label: 'title,category', order: 'created_at' },
  firm_photo: { table: 'firm_photos', title: 'Firm photo', label: 'caption,image_url', order: 'created_at' },
  project_image: { table: 'project_images', title: 'Project photo', label: 'caption,image_url' },
  firm_unit_photo: { table: 'firm_unit_photos', title: 'Firm team photo', label: 'caption,image_url', order: 'created_at' },
  project_thread_file: { table: 'project_thread_files', title: 'Project file', label: 'file_url,file_type', author: 'uploaded_by', order: 'created_at' },
  career_entry: { table: 'career_timeline', title: 'Profile experience entry', label: 'role,organization', idType: 'int', author: 'user_id', order: 'created_at' },
  check_review: { table: 'check_reviews', title: 'Check review', label: 'title,file_name,file_path', author: 'owner_id', order: 'created_at' },
  swap_generation: { table: 'swap_generations', title: 'Swap image', label: 'swap_type,prompt,source_path,result_path,mask_path', author: 'owner_id', order: 'created_at' },
  drawing: { table: 'drawings', title: 'Drawing', label: 'name,sheet_number', author: 'owner_id', order: 'created_at' },
  draw_markup: { table: 'draw_markups', title: 'Markup', label: 'name,source_name,source_path', author: 'owner_id', order: 'created_at' },
  portfolio_review: { table: 'portfolio_reviews', title: 'Portfolio review', label: 'file_name,file_path', author: 'user_id', order: 'created_at' },
};

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const validId = (k: Kind, id: string) => (k.idType === 'int' ? /^\d{1,18}$/.test(id) : isUuid(id));

export function labelOf(k: Kind, row: any) {
  for (const c of k.label.split(',')) {
    const v = row?.[c];
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/\s+/g, ' ').slice(0, 160);
  }
  return k.title;
}
