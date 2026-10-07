// V20 speed: a fast, no-web-search call that gives a first answer (or a clarifying question)
// within a few seconds, while the full sourced answer keeps running as a background job.
// Server-only (uses the OpenAI key). The quick answer is never presented as verified.

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
export const QUICK_TIMEOUT_MS = 12000;

export function fastModels() {
  return [...new Set([process.env.DRAWUP_FAST_MODEL, 'gpt-4.1-mini', 'gpt-4o-mini'].filter(Boolean))] as string[];
}

export type QuickOption = { label: string; value: string };
export type QuickResult =
  | { kind: 'answer'; answer: string; title?: string; entity_type?: string; location?: string; model: string; ms: number }
  | { kind: 'clarify'; question: string; options: QuickOption[]; model: string; ms: number };

function parseJson(text: string) {
  const t = (text || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}
function textOf(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
  return (data?.output || []).flatMap((o: any) => o?.content || []).map((c: any) => c?.text || '').join('\n').trim();
}
const clip = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Normalizes a model reply into an answer or a clarifying question. Returns null when unusable. */
export function readQuick(obj: any, allowClarify: boolean, model: string, ms: number): QuickResult | null {
  if (!obj || typeof obj !== 'object') return null;
  if (allowClarify && obj.clarify === true) {
    const question = clip(obj.question, 220);
    const options: QuickOption[] = (Array.isArray(obj.options) ? obj.options : [])
      .map((o: any) => typeof o === 'string' ? { label: clip(o, 80), value: clip(o, 160) } : { label: clip(o?.label, 80), value: clip(o?.value || o?.query || o?.label, 160) })
      .filter((o: QuickOption) => o.label && o.value)
      .slice(0, 5);
    if (question && options.length >= 2) return { kind: 'clarify', question, options, model, ms };
  }
  const answer = String(obj.answer || '').trim().slice(0, 1500);
  if (!answer) return null;
  return { kind: 'answer', answer, title: clip(obj.title, 200) || undefined, entity_type: clip(obj.entity_type, 40) || undefined, location: clip(obj.location, 160) || undefined, model, ms };
}

/** One fast call with a hard timeout. Never throws: returns null on timeout or any error. */
export async function quickCall(input: string, allowClarify: boolean, timeoutMs = QUICK_TIMEOUT_MS): Promise<QuickResult | null> {
  if (!OPENAI_KEY) return null;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (const model of fastModels()) {
      const r = await fetch(OPENAI_BASE + '/responses', {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input, max_output_tokens: 450, text: { format: { type: 'json_object' } } }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = String(data?.error?.message || '');
        if ([400, 404].includes(r.status) && /model/i.test(msg)) continue;
        return null;
      }
      return readQuick(parseJson(textOf(data)), allowClarify, model, Date.now() - t0);
    }
    return null;
  } catch {
    return null;
  } finally { clearTimeout(timer); }
}

const CLARIFY_RULES = `Ask a clarifying question ONLY when the request is genuinely ambiguous and a wrong guess would waste the user's time, for example: a place name shared by several cities or states (like "Richmond" or "Springfield" with no state), "best program" or "top school" with no discipline or degree level, a zoning/code question with no jurisdiction, or a building type that could mean very different things. Do NOT ask when one meaning is clearly the most notable, when the conversation already answers it, or when the request is a specific named building, firm or person.`;

/** Quick prompt for DrawUp Search. Options carry a refined search the page can rerun. */
export function quickSearchPrompt(query: string, type: string, allowClarify: boolean) {
  return `DRAWUP QUICK ANSWER MODE (search). You answer in JSON only, fast, without browsing.
User search: "${query}" (filter: ${type}).
${allowClarify ? CLARIFY_RULES + `
If you must clarify, return {"clarify":true,"question":"<one short question>","options":[{"label":"<2-5 words>","value":"<the full refined search to run>"}]} with 2 to 5 options, most likely first.` : 'Do not ask a clarifying question.'}
Otherwise return {"clarify":false,"title":"<what this most likely refers to>","entity_type":"project|firm|university|person|resource|answer","location":"<city, state/country if known>","answer":"<2-4 plain sentences: the most useful preliminary answer>"}.
Rules: this is a preliminary answer that DrawUp will check against live sources, so only state things you are confident are widely known; leave out exact numbers, dates or names you are not sure of; never invent facts; no links.`;
}

/** Quick prompt for Arch Coach. Options carry a short clue that is added to the question. */
export function quickCoachPrompt(conversation: string, location: string, allowClarify: boolean) {
  return `DRAWUP QUICK ANSWER MODE (Arch Coach, DrawUp's AEC copilot). You answer in JSON only, fast, without browsing. Stay professional, no slang or explicit language.
${conversation}
${location ? `PROJECT LOCATION: ${location}\n` : ''}${allowClarify ? CLARIFY_RULES + `
If you must clarify, return {"clarify":true,"question":"<one short question>","options":[{"label":"<2-5 words>","value":"<short clue to add to the question>"}]} with 2 to 5 options.` : 'Do not ask a clarifying question.'}
Otherwise return {"clarify":false,"answer":"<a short, practical first answer to the latest USER message in 2-5 sentences>"}.
Rules: this is a preliminary answer while Arch Coach checks current sources, so state only what you are confident about, flag anything jurisdiction-specific as to be confirmed, never invent code section numbers or facts, and do not mention models or credits.`;
}

/* ------------------------------------------------------------------ saved-search keys */
const STOP = new Set('a an the of in at for and to on by me show find what whats is are who about tell list give near best top please search info information'.split(' '));
const STATE_ABBR: Record<string, string> = { al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut', dc: 'district columbia', fl: 'florida', ga: 'georgia', ia: 'iowa', id: 'idaho', il: 'illinois', ks: 'kansas', ky: 'kentucky', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming' };

export const normQuery = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Order-free key for near-duplicate searches: "SoFi Stadium Inglewood" = "inglewood sofi stadium",
 *  "Richmond, VA" = "richmond virginia". Falls back to the normal form when nothing is left. */
export function searchKey(q: string) {
  const words = normQuery(q).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    if (STOP.has(w)) continue;
    const full = words.length > 1 ? STATE_ABBR[w] : undefined;
    (full || w).split(' ').forEach(x => out.add(x.replace(/(?<=[a-z]{3})s$/, '')));
  }
  return [...out].sort().join(' ') || normQuery(q);
}
