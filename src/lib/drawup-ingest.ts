// V20: when DrawUp Search researches a project and the sources name an architect, engineer or
// contractor that is not on DrawUp yet, list that firm (unclaimed, unverified, from public sources),
// list the project, and credit the firm on it. Only names that appear in the sourced result are used.
// Server-only (service role).
import { adminRest, adminRpc } from '@/lib/drawup-server';

export const MAX_NEW_FIRMS = 6;
export const LISTED_VIA = 'drawup_search';

type TeamMember = { name: string; role: string; source?: string };
export type IngestReport = { project?: { slug: string; name: string; created: boolean }; firms: { name: string; slug: string; created: boolean; role: string }[]; skipped: string[] };

const JUNK_WORDS = new Set(['various', 'others', 'other', 'unknown', 'none', 'n a', 'na', 'tbd', 'tba', 'local', 'multiple', 'several', 'team', 'joint venture', 'jv', 'architect', 'architects', 'engineer', 'engineers', 'contractor', 'contractors', 'owner', 'developer', 'city', 'county', 'state', 'university', 'design team', 'consultants', 'not disclosed', 'undisclosed', 'not available', 'general contractor', 'structural engineer', 'mep engineer', 'construction manager', 'design build', 'design builder', 'firm', 'firms', 'company']);
const JUNK_PHRASE = /\b(and others|et al|various|unknown|not (publicly )?(disclosed|available|listed|named|specified)|undisclosed|tbd|tba|n\/a|including|among others|several|multiple|local firms?|unnamed|not found)\b/i;
const ROLE_OK = /architect|engineer|contractor|builder|construction|design/i;

const clean = (s: unknown) => String(s ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '').trim();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const httpUrl = (u: unknown) => (/^https?:\/\/[^\s]+$/i.test(String(u || '')) ? String(u) : '');
const imageUrl = (u: unknown) => { const x = httpUrl(u); return x && !/google\.|bing\.com\/search|search\?q=/i.test(x) ? x : ''; };

/** True when a candidate looks like a real firm name and not filler text. */
export function looksLikeFirm(name: string) {
  const n = clean(name);
  if (n.length < 3 || n.length > 80) return false;
  if (!/[A-Za-z]/.test(n) || !/^[A-Z0-9]/.test(n)) return false;
  if (JUNK_PHRASE.test(n)) return false;
  if (JUNK_WORDS.has(n.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim())) return false;
  if (n.split(' ').length > 9) return false;
  return true;
}

function roleFromParen(raw: string, base: string) {
  const p = /\(([^)]+)\)/.exec(raw)?.[1] || '';
  if (/structural/i.test(p)) return 'Structural engineer';
  if (/mep|mechanical|electrical|plumbing/i.test(p)) return 'MEP engineer';
  if (/civil/i.test(p)) return 'Civil engineer';
  if (/landscape/i.test(p)) return 'Landscape architect';
  return base;
}

/** The firms the result credits, preferring the structured team list, else conservative field parsing. */
export function teamOf(r: any): TeamMember[] {
  const out: TeamMember[] = [];
  if (Array.isArray(r?.team)) for (const t of r.team) {
    const role = String(t?.role || '').trim().slice(0, 80);
    if (t?.name && ROLE_OK.test(role)) out.push({ name: clean(t.name), role, source: httpUrl(t.source || t.url) });
  }
  // An explicit (even empty) team list from the research is authoritative; older saved results fall back to the fields.
  if (!Array.isArray(r?.team)) {
    const fields: [string, string][] = [['architect', 'Architect'], ['engineers', 'Engineer'], ['contractor', 'General contractor']];
    for (const [k, base] of fields) for (const raw of String(r?.[k] || '').split(/;|\s\/\s/)) {
      const name = clean(raw);
      if (!name || /,/.test(name)) continue; // ambiguous lists stay out unless already structured
      out.push({ name, role: roleFromParen(raw, base) });
    }
  }
  const seen = new Set<string>();
  return out.filter(t => { const k = t.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Every piece of the result except the team list, used to prove a name came from the sourced text. */
function sourcedText(r: any) {
  const { team: _t, ...rest } = r || {};
  return JSON.stringify(rest).toLowerCase();
}

function parsePlace(loc: string) {
  const parts = String(loc || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return { city: null as string | null, state: null as string | null, country: 'US' };
  const city = parts[0].replace(/^\d+\s.*$/, '') || null;
  const second = (parts[1] || '').replace(/\s+\d{5}(-\d{4})?$/, '');
  if (/^[A-Z]{2}$/.test(second) || /^(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)$/i.test(second)) return { city, state: second, country: 'US' };
  if (parts.length >= 2) return { city, state: parts.length > 2 ? parts[1] : null, country: parts[parts.length - 1] };
  return { city, state: null, country: 'US' };
}
const year = (v: unknown) => { const m = /\b(1[89]\d{2}|20\d{2})\b/.exec(String(v || '')); return m ? Number(m[1]) : null; };

async function rows(path: string) { const r = await adminRest(path); return r.ok ? await r.json() : []; }
async function insert(table: string, body: Record<string, unknown>) {
  const r = await adminRest(table, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${table}: ${await r.text()}`);
  return (await r.json())[0];
}
async function freeSlug(table: string, base: string) {
  const b = base || 'listed';
  for (let i = 0; i < 20; i++) {
    const s = i ? `${b}-${i + 1}` : b;
    if (!(await rows(`${table}?slug=eq.${encodeURIComponent(s)}&select=id&limit=1`)).length) return s;
  }
  return `${b}-${Date.now().toString(36)}`;
}

/** Lists new firms + the project from a finished project research result. Never throws. */
export async function ingestResearch(r: any, query: string): Promise<IngestReport | null> {
  try {
    if (!r || r.entity_type !== 'project') return null;
    const sources = (Array.isArray(r.sources) ? r.sources : []).map((s: any) => httpUrl(s?.url)).filter(Boolean);
    const projectName = clean(r.title);
    if (!sources.length || !projectName || projectName.length < 3) return null;
    const text = sourcedText(r);
    const report: IngestReport = { firms: [], skipped: [] };
    const team = teamOf(r).filter(t => {
      const ok = looksLikeFirm(t.name) && text.includes(t.name.toLowerCase());
      if (!ok) report.skipped.push(t.name);
      return ok;
    }).slice(0, MAX_NEW_FIRMS);

    // Resolve firms first (existing via drawup_match_firm, else list a new unverified one).
    const resolved: { id: string; slug: string; name: string; role: string; created: boolean }[] = [];
    for (const t of team) {
      let id: string | null = null;
      try { id = await adminRpc<string | null>('drawup_match_firm', { p_name: t.name }); } catch {}
      if (id) {
        const f = (await rows(`firms?id=eq.${id}&select=id,slug,name`))[0];
        if (f) { resolved.push({ ...f, role: t.role, created: false }); continue; }
      }
      const source = t.source || sources[0];
      const f = await insert('firms', {
        slug: await freeSlug('firms', slugify(t.name)), name: t.name, is_verified: false, is_demo: false,
        source_url: source, listed_via: LISTED_VIA,
        research_note: `Unconfirmed. Listed from public sources by DrawUp Search: named as ${t.role} of ${projectName}. Not claimed or confirmed by the firm.`,
      });
      resolved.push({ id: f.id, slug: f.slug, name: f.name, role: t.role, created: true });
    }

    // The project, deduped by name + city.
    const place = parsePlace(r.location);
    const nameQ = `name=ilike.${encodeURIComponent(projectName.replace(/[%_*]/g, ''))}`;
    const cityQ = place.city ? `&city=ilike.${encodeURIComponent(place.city.replace(/[%_*]/g, ''))}` : '&city=is.null';
    let project = (await rows(`aec_projects?${nameQ}${cityQ}&is_demo=eq.false&select=id,slug,name&limit=1`))[0];
    let createdProject = false;
    if (!project) {
      const done = year(r.completed) || null;
      project = await insert('aec_projects', {
        slug: await freeSlug('aec_projects', slugify(projectName + (place.city ? ' ' + place.city : ''))), name: projectName,
        city: place.city, state: place.state, country: place.country || 'US', project_type: clean(r.type).slice(0, 80) || null,
        completion_year: done, opened_year: year(r.opened), status: done || year(r.opened) ? 'completed' : null,
        description: String(r.summary || '').slice(0, 2000) || null, owner_name: clean(r.owner).slice(0, 200) || null,
        cost_text: clean(r.cost).slice(0, 120) || null, capacity_text: clean(r.capacity).slice(0, 120) || null, size_text: clean(r.area).slice(0, 120) || null,
        listed_via: LISTED_VIA,
      });
      createdProject = true;
      for (const s of (r.sources || []).filter((s: any) => httpUrl(s?.url)).slice(0, 6))
        await insert('project_sources', { project_id: project.id, source_name: clean(s.title || s.publisher || 'Source').slice(0, 200) || 'Source', source_url: s.url }).catch(() => null);
    }
    // V21.3 Discover media: a project found by DrawUp Search should keep a real project image.
    // Firm-uploaded images always win: only add web-discovered media when the project has no image yet.
    const existingImages = await rows(`project_images?project_id=eq.${project.id}&select=id&limit=1`);
    if (!existingImages.length) {
      const sourceObjects = Array.isArray(r.sources) ? r.sources : [];
      const webImage = imageUrl(r.image || r.image_url || r.hero_image || r.thumbnail || sourceObjects.find((s: any) => imageUrl(s?.image))?.image);
      if (webImage) {
        const imageSource = httpUrl(r.image_source_url) || httpUrl(sourceObjects.find((s: any) => imageUrl(s?.image) === webImage)?.url) || sources[0] || '';
        await insert('project_images', {
          project_id: project.id, image_url: webImage,
          caption: `Web-discovered project image${imageSource ? ' · source: ' + imageSource : ''}`.slice(0, 1000),
          is_hero: true, sort_order: 0,
        }).catch(() => null);
        if (imageSource) await adminRest(`aec_projects?id=eq.${project.id}`, { method: 'PATCH', body: JSON.stringify({ image_page_url: imageSource }) }).catch(() => null);
      }
    }
    report.project = { slug: project.slug, name: project.name, created: createdProject };

    // Credit each firm once per project.
    for (const f of resolved) {
      const linked = await rows(`project_firms?project_id=eq.${project.id}&firm_id=eq.${f.id}&select=id&limit=1`);
      if (!linked.length) await insert('project_firms', { project_id: project.id, firm_id: f.id, role: f.role, provenance: 'public_source' });
      report.firms.push({ name: f.name, slug: f.slug, created: f.created, role: f.role });
    }
    return report;
  } catch (e) {
    console.error('[drawup] ingestResearch failed for', query, e);
    return null;
  }
}
