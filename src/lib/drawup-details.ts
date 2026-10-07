// DrawUp v21 Detail Library: when a member asks Arch Coach or DrawUp Search for a
// construction detail ("parapet detail", "storefront sill detail"), record it in the
// shared detail database (detail_finds, migration 0039) under the right category,
// de-duplicated, with the public sources the answer cited. Never throws, never blocks.
import { adminRest, adminRpc } from '@/lib/drawup-server';

export type DetailSource = 'arch_coach' | 'search';
type Cited = { title?: string; url?: string };

// Most specific first: the first category with a matching phrase wins.
const CATEGORIES: [string, RegExp][] = [
  ['Wall Sections', /\bwall sections?\b/],
  ['Storefront / Curtain Wall', /\b(storefront|curtain ?wall|mullion|spandrel|glazing system)\b/],
  ['Restrooms / ADA', /\b(ada|accessible|accessibility|grab bars?|restrooms?|toilet|water closet|lavator(y|ies)|urinal|shower)\b/],
  ['Railings', /\b(railings?|guard ?rails?|guards?|handrails?|balusters?)\b/],
  ['Stairs', /\b(stairs?|stairway|treads?|risers?|stringers?|nosings?|landing)\b/],
  ['Fire / Life Safety', /\b(fire ?stop|firestopping|fire[- ]rated|rated (wall|joint|assembly)|head of wall|smoke|fire barrier|penetration seal)\b/],
  ['Site', /\b(curb (and|&) gutter|sidewalks?|bollards?|paving|retaining walls?)\b/],
  ['Roofs', /\b(roofs?|roofing|parapets?|coping|eaves?|gutters?|scuppers?|roof drain|skylights?|ridge|valley|fascia|cricket)\b/],
  ['Windows', /\b(windows?|window sill|sill pan)\b/],
  ['Doors', /\b(doors?|thresholds?|door frame|hollow metal|door jamb|door head)\b/],
  ['Foundations', /\b(footings?|foundations?|frost wall|piers?|grade beam|stem wall|basement wall|waterproofing)\b/],
  ['Slabs', /\b(slab|slab on grade|vapor retarder|vapor barrier|control joint|isolation joint|topping)\b/],
  ['Millwork', /\b(millwork|casework|cabinets?|countertops?|reception desk|transaction counter|shelving|vanity)\b/],
  ['Ceilings', /\b(ceilings?|acoustical|act|soffits?|bulkheads?|suspended)\b/],
  ['MEP Coordination', /\b(duct|ductwork|pipes?|piping|mep|plumbing|conduit|hvac|plenum|sprinkler|rooftop unit|rtu)\b/],
  ['Site', /\b(curbs?|sidewalks?|paving|pavers?|bollards?|retaining wall|fence|site|landscape|ramp)\b/],
  ['Structural', /\b(steel|beams?|columns?|base plate|connection|lintels?|joists?|moment|shear tab|anchor bolts?)\b/],
  ['Interiors', /\b(partitions?|interior wall|stud wall|flooring|floor transition|wall base)\b/],
  ['Exterior Walls', /\b(exterior wall|siding|brick|veneer|masonry|cmu|eifs|cladding|rainscreen|sheathing|weeps?|stucco)\b/],
];
const DETAIL_WORD = /\b(details?|detailing|wall section|flashing)\b/;
const NOT_DETAIL = /\b(contact|project|firm|company|account|billing|personal|more|full) details\b/;
const FILLER = new Set('a an the of in at for and to on by me show find what whats is are how do does i you we can please give typical standard example good best drawing drawings dwg cad detail details detailing need needs want get should look like with explain describe tell why when where which this that these my our it be would could about work works use used draw drawn sketch help'.split(' '));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Category + de-dup key + clean title for a detail query, or null when it is not one. */
/** Long prompts (a lesson or page context + the question): keep only the sentence that asks for the detail. */
function questionPart(text: string) {
  const parts = String(text || '').trim().split(/(?<=[.?!])\s+|\n+/).map(x => x.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  return parts.slice(-2).reverse().find(x => DETAIL_WORD.test(norm(x))) || '';
}

export function detailIntent(text: string): { key: string; title: string; category: string } | null {
  const q = norm(questionPart(text).slice(0, 300));
  if (!q || q.length > 220 || !DETAIL_WORD.test(q) || NOT_DETAIL.test(q)) return null;
  const hit = CATEGORIES.find(([, re]) => re.test(q));
  if (!hit) return null;
  const words = q.replace(/\//g, ' ').split(' ').filter(w => w && !FILLER.has(w)).map(w => w.replace(/(?<=[a-z]{3})s$/, ''));
  if (!words.length) return null;
  const key = [...new Set(words)].sort().join(' ').slice(0, 160);
  const kept = q.replace(/\//g, ' ').split(' ').filter(w => w && !FILLER.has(w)).slice(0, 9);
  const title = kept.map(w => (w.length <= 3 && /^(ada|cmu|mep|act|rtu|eifs|hm|wrb)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ') + ' Detail';
  return { key, title: title.slice(0, 140), category: hit[0] };
}

async function mergeSources(findId: string, cited: Cited[]) {
  const clean = (cited || []).filter(s => s?.url && /^https?:\/\//i.test(s.url) && !/google\.|bing\.com\/search|search\?q=/i.test(s.url))
    .map(s => ({ title: String(s.title || 'Source').slice(0, 200), url: String(s.url).slice(0, 600) }));
  if (!clean.length) return;
  const r = await adminRest(`detail_finds?id=eq.${findId}&select=sources`);
  const prev: Cited[] = r.ok ? ((await r.json())[0]?.sources || []) : [];
  const seen = new Set<string>(); const all = [...prev, ...clean].filter(s => s.url && !seen.has(s.url) && (seen.add(s.url), true)).slice(0, 10);
  await adminRest(`detail_finds?id=eq.${findId}`, { method: 'PATCH', body: JSON.stringify({ sources: all, updated_at: new Date().toISOString() }) });
}

/** Called when a member asks. Non-detail questions close the member's pending detail event so a
 *  later answer's sources are never attached to the wrong detail. */
export async function recordDetailQuery(text: string, source: DetailSource, userId?: string | null) {
  try {
    const intent = detailIntent(text);
    if (userId) await adminRest(`detail_find_events?user_id=eq.${userId}&source=eq.${source}&attached=eq.false`, { method: 'PATCH', body: JSON.stringify({ attached: true }) });
    if (!intent) return;
    const id = await adminRpc<string>('drawup_detail_find_note', { p_key: intent.key, p_title: intent.title, p_category: intent.category, p_query: questionPart(text).slice(0, 400), p_source: source, p_user: userId || null });
    // A repeat Search that is answered from the 30-day cache never polls again: take its saved sources now.
    if (source === 'search' && id) {
      const s = await adminRest(`drawup_searches?query_norm=eq.${encodeURIComponent(String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())}&status=eq.complete&select=result&order=completed_at.desc&limit=1`);
      const row = s.ok ? (await s.json())[0] : null;
      if (row?.result?.sources) await mergeSources(id, row.result.sources);
    }
  } catch (e) { console.warn('detail find not recorded', (e as Error)?.message); }
}

/** Called when an answer arrives. Search passes the query text; Arch Coach passes the member
 *  (its answer ticket does not carry the question) and the latest open detail event is used. */
export async function recordDetailSources(source: DetailSource, who: { text?: string; userId?: string | null }, cited: Cited[] | undefined) {
  try {
    if (who.text) {
      const intent = detailIntent(who.text);
      if (!intent) return;
      const r = await adminRest(`detail_finds?query_key=eq.${encodeURIComponent(intent.key)}&select=id`);
      const row = r.ok ? (await r.json())[0] : null;
      if (row?.id) await mergeSources(row.id, cited || []);
      return;
    }
    if (!who.userId) return;
    const since = new Date(Date.now() - 20 * 60e3).toISOString();
    const r = await adminRest(`detail_find_events?user_id=eq.${who.userId}&source=eq.${source}&attached=eq.false&created_at=gte.${since}&select=id,find_id&order=created_at.desc&limit=1`);
    const ev = r.ok ? (await r.json())[0] : null;
    if (!ev?.find_id) return;
    await adminRest(`detail_find_events?id=eq.${ev.id}`, { method: 'PATCH', body: JSON.stringify({ attached: true }) });
    await mergeSources(ev.find_id, cited || []);
  } catch (e) { console.warn('detail sources not recorded', (e as Error)?.message); }
}
