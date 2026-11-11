import { SOURCES, lookupSite } from '@/lib/drawup-project-intel';
import { signedInUser } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Season 1 Project Intelligence: public site lookups for Projects › Project Information.
//   POST { action: 'lookup', address } -> { fields, site, sources, unavailable, at }
//   site has the parcel, zoning (with parking), vicinity map data and nearby buildings where DrawUp covers the place.
// Free (no credits, no AI). Signed-in members only. The route only reads public services and returns what it
// found with the source, date and confidence; the page saves it to project_profiles under the member's own RLS,
// and never over a value the member entered or verified (mergeLookup).
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const TIMEOUT_MS = 12000;

async function fetchJson(url: string) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json', 'User-Agent': 'DrawUp/1.0 (project site lookup)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e: any) { throw new Error(e?.name === 'AbortError' ? 'timed out' : (e?.message || 'request failed')); }
  finally { clearTimeout(t); }
}

export async function GET() {
  return json({ sources: Object.values(SOURCES).map(s => ({ name: s.name, url: s.home })), credits: 0 });
}

export async function POST(request: Request) {
  // Only Supabase sign-in is needed here: this route uses no AI and no credits.
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to look up site data.' }, 401);
  let body: any = {}; try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  if (body.action !== 'lookup') return json({ error: 'Unknown action.' }, 400);
  const address = String(body.address ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (address.length < 6 || !/\d/.test(address)) return json({ error: 'Enter a street address with a number, city and state.' }, 400);
  const out = await lookupSite(address, fetchJson);
  return json(out);
}
