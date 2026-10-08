import { NextResponse } from 'next/server';
import { adminRest, adminRpc } from '@/lib/drawup-server';
import { KINDS, bad, labelOf, requireFounder } from '@/lib/drawup-hq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DrawUp HQ founder views (founder account only, checked from the signed-in token):
//   GET /api/hq?view=me                 -> { founder: true } (403 for everyone else)
//   GET /api/hq?view=accounts&q=        -> accounts with type, created date and what they own
//   GET /api/hq?view=content&kind=&q=   -> recent items of one content kind
//   GET /api/hq?view=files              -> files left in Storage by accounts that no longer exist
//   GET /api/hq?view=audit              -> the deletion log

const json = (data: unknown) => NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const f = await requireFounder(request);
  if (f instanceof Response) return f;
  const sp = new URL(request.url).searchParams;
  const view = sp.get('view') || 'me';
  const q = (sp.get('q') || '').trim().slice(0, 120);
  try {
    if (view === 'me') return json({ founder: true, id: f.user.id, email: f.email });
    if (view === 'accounts') {
      const rows = await adminRpc<any[]>('hq_accounts', { p_query: q || null, p_limit: 300 });
      return json({ accounts: (rows || []).map(a => ({ ...a, is_self: a.id === f.user.id, protected: a.account_type === 'founder' || ['vintagebyjaja@gmail.com', 'jaja@vybr8.live'].includes(String(a.email || '').toLowerCase()) })) });
    }
    if (view === 'content') {
      const kind = sp.get('kind') || 'connect_post';
      const k = KINDS[kind];
      if (!k) return bad('Unknown kind of content.');
      const cols = ['id', ...k.label.split(','), ...(k.author ? [k.author] : []), ...(k.order === 'created_at' ? ['created_at'] : [])];
      const safe = q.replace(/[*,()."\\]/g, ' ').trim();
      const textCols = k.label.split(',').filter(c => !/urls$/.test(c));
      const filter = safe ? `&or=(${encodeURIComponent(textCols.map(c => `${c}.ilike.*${safe}*`).join(','))})` : '';
      const r = await adminRest(`${k.table}?select=${[...new Set(cols)].join(',')}${filter}${k.order ? `&order=${k.order}.desc` : ''}&limit=60`);
      if (!r.ok) return bad(`Could not read ${k.title}: ${(await r.text()).slice(0, 200)}`, 500);
      const rows = await r.json();
      const ids = [...new Set(rows.map((x: any) => k.author && x[k.author]).filter(Boolean))] as string[];
      const people = new Map<string, any>();
      if (ids.length) {
        const pr = await adminRest(`profiles?id=in.(${ids.join(',')})&select=id,display_name,username`);
        if (pr.ok) for (const p of await pr.json()) people.set(p.id, p);
      }
      return json({
        kind, title: k.title, kinds: Object.entries(KINDS).map(([key, v]) => ({ key, title: v.title })),
        items: rows.map((x: any) => ({ id: x.id, label: labelOf(k, x), created_at: x.created_at || null, author: k.author ? people.get(x[k.author])?.display_name || (x[k.author] ? 'Member' : null) : null })),
      });
    }
    if (view === 'files') {
      const all = (await adminRpc<any[]>('hq_leftover_files', { p_limit: 1000 })) || [];
      const inUse = new Set(all.length ? await adminRpc<string[]>('hq_paths_in_use', { p_names: all.map(x => x.name) }) : []);
      const rows = all.filter(x => !inUse.has(x.name));
      const bytes = rows.reduce((s, x) => s + Number(x.bytes || 0), 0);
      return json({ count: rows.length, bytes, in_use: all.length - rows.length });
    }
    if (view === 'audit') {
      const r = await adminRest('hq_audit?select=*&order=created_at.desc&limit=100');
      return json({ items: r.ok ? await r.json() : [] });
    }
    return bad('Unknown view.');
  } catch (e: any) {
    return bad(e?.message || String(e), 500);
  }
}
