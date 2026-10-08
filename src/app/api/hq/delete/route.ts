import { NextResponse } from 'next/server';
import { SB_URL, adminRest, adminRpc } from '@/lib/drawup-server';
import { KINDS, type Founder, audit, bad, filesInRow, isUuid, labelOf, removeUnusedFiles, requireFounder, validId, type FileRef } from '@/lib/drawup-hq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DrawUp HQ delete (founder account only, checked from the signed-in token on every call).
// POST { kind: 'account', id, confirm }        -> removes the account rows, the auth user and its unused files
// POST { kind: 'leftover_files' }              -> removes unused files left by accounts that no longer exist
// POST { kind: '<content kind>', id }          -> removes one post, comment, message, photo, file ... (see KINDS)
// POST { kind: 'message', id }                 -> chat message (uuid id) or direct message (number id)
// POST { kind: 'photo_url', url }              -> the firm / project / team photo or post image with that URL
// Every deletion is written to hq_audit.

const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PROTECTED = ['vintagebyjaja@gmail.com', 'jaja@vybr8.live'];

export async function POST(request: Request) {
  const f = await requireFounder(request);
  if (f instanceof Response) return f;
  const body = await request.json().catch(() => ({}));
  let kind = String(body?.kind || '');
  const id = String(body?.id ?? '').trim();
  try {
    if (kind === 'account') return await deleteAccount(f, id, String(body?.confirm || ''));
    if (kind === 'leftover_files') return await deleteLeftovers(f);
    if (kind === 'photo_url') return await deletePhotoByUrl(f, String(body?.url || ''));
    if (kind === 'message') kind = /^\d+$/.test(id) ? 'direct_message' : 'chat_message';
    const k = KINDS[kind];
    if (!k) return bad('Unknown kind of content.');
    if (!validId(k, id)) return bad('Unknown item.');
    const files: FileRef[] = [];
    for (const ch of k.children || []) {
      const r = await adminRest(`${ch.table}?${ch.fk}=eq.${id}&select=*`);
      if (r.ok) for (const row of await r.json()) files.push(...filesInRow(row));
    }
    const r = await adminRest(`${k.table}?id=eq.${id}`, { method: 'DELETE' });
    if (!r.ok) return bad(`Could not delete: ${(await r.text()).slice(0, 300)}`, 409);
    const rows = await r.json();
    if (!rows.length) return bad('That item was already removed.', 404);
    const row = rows[0];
    files.push(...filesInRow(row));
    const fr = await removeUnusedFiles(files);
    const label = labelOf(k, row);
    await audit(f, kind, id, label, { table: k.table, author_id: k.author ? row[k.author] : null, files_removed: fr.removed });
    return NextResponse.json({ ok: true, kind, id, label, files_removed: fr.removed.length });
  } catch (e: any) {
    return bad(e?.message || String(e), 500);
  }
}

async function deleteAccount(f: Founder, id: string, confirm: string) {
  if (!isUuid(id)) return bad('Unknown account.');
  if (id === f.user.id) return bad('The founder account cannot be deleted.', 403);
  const found = await adminRpc<any[]>('hq_accounts', { p_query: id, p_limit: 1 });
  const acc = (found || []).find(a => a.id === id);
  if (!acc) return bad('That account no longer exists.', 404);
  if (acc.account_type === 'founder' || PROTECTED.includes(String(acc.email || '').toLowerCase())) return bad('This account is protected and cannot be deleted.', 403);
  const expected = acc.email ? String(acc.email).toLowerCase() : 'DELETE';
  if (confirm.trim().toLowerCase() !== expected.toLowerCase()) return bad(acc.email ? 'Type the account email exactly to confirm.' : 'Type DELETE to confirm.');
  const files = await adminRpc<{ bucket_id: string; name: string }[]>('hq_account_files', { p_user: id });
  const res = await adminRpc<any>('hq_delete_account', { p_user: id, p_actor: f.user.id });
  // The database function already removed the auth user. This is a safety net for projects
  // where SQL cannot delete auth users: the Auth admin API removes it instead (404 = already gone).
  const au = await fetch(`${SB_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE } });
  if (!au.ok && au.status !== 404) console.error('[drawup hq] auth admin delete', au.status, await au.text());
  const fr = await removeUnusedFiles(files || []);
  if (res?.audit_id) {
    await adminRest(`hq_audit?id=eq.${res.audit_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ detail: { account_type: acc.account_type, name: acc.display_name, nulled: res.nulled, removed_blocking_rows: res.removed_blocking_rows, owned: acc.owned, files_removed: fr.removed.length, files_kept_in_use: fr.kept } }),
    });
  }
  return NextResponse.json({ ok: true, kind: 'account', id, email: acc.email, files_removed: fr.removed.length, files_kept: fr.kept.length, result: res });
}

async function deleteLeftovers(f: Founder) {
  const files = await adminRpc<{ bucket_id: string; name: string }[]>('hq_leftover_files', { p_limit: 1000 });
  const fr = await removeUnusedFiles(files || []);
  await audit(f, 'leftover_files', '', `${fr.removed.length} leftover files`, { files_removed: fr.removed, files_kept_in_use: fr.kept });
  return NextResponse.json({ ok: true, kind: 'leftover_files', files_removed: fr.removed.length, files_kept: fr.kept.length });
}

async function deletePhotoByUrl(f: Founder, url: string) {
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) return bad('Unknown photo.');
  const q = encodeURIComponent(url);
  for (const kind of ['firm_photo', 'project_image', 'firm_unit_photo']) {
    const k = KINDS[kind];
    const r = await adminRest(`${k.table}?image_url=eq.${q}`, { method: 'DELETE' });
    if (!r.ok) return bad(`Could not delete: ${(await r.text()).slice(0, 300)}`, 409);
    const rows = await r.json();
    if (!rows.length) continue;
    if (kind === 'firm_unit_photo') await adminRest(`firm_units?hero_image_url=eq.${q}`, { method: 'PATCH', body: JSON.stringify({ hero_image_url: null }) });
    const fr = await removeUnusedFiles(rows.flatMap(filesInRow));
    for (const row of rows) await audit(f, kind, row.id, labelOf(k, row), { table: k.table, url, files_removed: fr.removed });
    return NextResponse.json({ ok: true, kind, id: rows[0].id, files_removed: fr.removed.length });
  }
  // A photo inside a member post: take that one image out of the post.
  const pr = await adminRest(`connect_posts?image_urls=cs.${encodeURIComponent(JSON.stringify([url]).replace(/^\[/, '{').replace(/\]$/, '}'))}&select=id,title,body,image_urls,author_id`);
  const posts = pr.ok ? await pr.json() : [];
  if (posts.length) {
    for (const p of posts) {
      await adminRest(`connect_posts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ image_urls: (p.image_urls || []).filter((u: string) => u !== url) }) });
      await audit(f, 'post_image', p.id, labelOf(KINDS.connect_post, p), { url, author_id: p.author_id });
    }
    const fr = await removeUnusedFiles(filesInRow(url));
    return NextResponse.json({ ok: true, kind: 'post_image', id: posts[0].id, files_removed: fr.removed.length });
  }
  return bad('This photo is part of a firm, project or university record, not a member upload. Edit that record in HQ instead.', 404);
}
