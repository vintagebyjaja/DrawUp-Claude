import { NextResponse } from 'next/server';
import { adminRest, models, openaiCancel, openaiCreate, openaiGet, outputText as responseText, signedInUser } from '@/lib/drawup-server';
import { streamCreate, streamRead } from '@/lib/drawup-stream';
import { normQuery, quickCall, quickSearchPrompt, searchKey, type QuickResult } from '@/lib/drawup-quick';
import { ingestResearch } from '@/lib/drawup-ingest';
import { recordDetailQuery, recordDetailSources } from '@/lib/drawup-details';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseJson(text: string) {
  const cleaned = (text || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {} }
  return null;
}
function outputText(data:any){
  if(data?.output_text) return data.output_text;
  return (data?.output||[]).flatMap((o:any)=>o?.content||[]).filter((c:any)=>c?.type==='output_text'||typeof c?.text==='string').map((c:any)=>c.text||'').join('\n');
}
function directSources(data:any){
  const out:any[]=[]; const seen=new Set<string>();
  for(const item of data?.output||[]) for(const content of item?.content||[]) for(const ann of content?.annotations||[]){
    const c=ann?.url_citation||ann; const url=c?.url;
    if(url && !/google\.|bing\.com\/search|search\?q=/i.test(url) && !seen.has(url)){seen.add(url);out.push({title:c?.title||'Source',publisher:'',url,summary:''});}
  }
  return out;
}

// V19: research runs as a background job so it has time to actually search the web.
// POST starts it and returns { id }; the page polls GET ?id=… until { result } arrives.
// If background jobs are unavailable, POST falls back to answering in one request.
function buildPrompt(query: string, type: string) {
  return `You are DrawUp Search, an AEC research engine. Research this exact user query on the live web: "${query}". Filter hint: ${type}.
Do NOT assume this is a project. Classify it as project/building, firm, person, university/program, code/resource, detail/product, list/comparison, or general AEC question.
Do the research FOR the user. Never send them to Google/Bing/search-result pages and never tell them to add more words when a reasonable answer can be found.
Prioritize direct and useful sources: architecture/engineering/contractor/owner/developer project pages; ArchDaily; Dezeen; ENR; Architect Magazine; official universities and accreditation bodies; government/code sources; institutional/venue pages; reputable local/national news. For a known building/project, gather enough facts to make a polished DrawUp profile. For a firm, make a firm profile. For a question/list, answer the question directly with useful sourced items.
Only state facts supported by pages you found. Omit unknown fields. Do not discuss whether DrawUp has verified something. Do not say information is not public unless a source explicitly says that.
Return ONLY JSON:
{"title":"","entity_type":"project|firm|university|person|resource|answer","type":"","location":"","image":"","image_source_url":"","summary":"","answer":"","architect":"","engineers":"","contractor":"","owner":"","opened":"","completed":"","area":"","cost":"","capacity":"","story":"","design_highlights":[""],"team":[{"name":"","role":"","source":""}],"items":[{"title":"","subtitle":"","summary":"","url":""}],"sources":[{"title":"","publisher":"","url":"","summary":"","image":""}]}
For list/question searches, put a concise direct answer in answer and the actual results in items. For entity searches, fill the applicable profile fields. Aim for 3-8 direct useful sources. For a project/building, also find a legitimate project photograph or rendering from an official architect, engineer, contractor, owner/venue, university, or reputable architecture/construction publication and return its direct image URL as top-level "image" when available, and put the webpage that supplied/credits that image in top-level "image_source_url". Prefer official architect, engineer, contractor, owner/venue, university, or reputable AEC publication imagery. Never invent or AI-generate a picture of an existing project. Include architecture, structural/civil/MEP engineering, contractor/construction manager, owner/developer, cost, schedule, area, capacity and construction/design highlights whenever the sources support them. Treat AEC as Architecture + Engineering + Construction equally.
For a project, list every architecture, engineering and construction firm the sources credit in "team": name exactly as written in the source (one firm per entry, never a list, never \"and others\"), role (for example Architect, Structural engineer, MEP engineer, General contractor) and the URL of the page that names it. Leave team empty when no source names a firm.
Work like a researcher: run several web searches (the name, the name plus city, the architect or contractor's own project page, and recent news) before answering. Never answer from memory alone, and keep searching until you have at least 4 direct sources when they exist.`;
}
// V20: Discover People looks up well-known designers, architects and engineers from public sources.
function buildPersonPrompt(query: string) {
  return `You are DrawUp People Research. Research this person in architecture, engineering, construction or design on the live web: "${query}".
Find the most notable real person matching the name (for example a well-known architect, designer, engineer or builder). If the name is ambiguous, pick the most notable AEC person and say so in summary.
Use reliable public sources: the person's own firm or studio site, university pages, Pritzker or other award pages, museums, ArchDaily, Dezeen, Architect Magazine, ENR, Britannica, Wikipedia, and reputable news. Run several searches (the name, the name plus firm, the name plus projects, awards).
Only state facts the sources support. Omit unknown fields. Never invent projects, dates or quotes.
Return ONLY JSON:
{"title":"<full name>","entity_type":"person","role":"<e.g. Architect, Structural engineer>","summary":"<2-3 sentence bio>","bio":"<longer bio, 1-3 short paragraphs>","born":"","died":"","nationality":"","based_in":"","education":[{"school":"","detail":""}],"firms":[{"name":"","role":"","years":"","url":""}],"projects":[{"name":"","location":"","year":"","type":"","url":""}],"awards":[{"name":"","year":""}],"known_for":[""],"website":"","image":"","sources":[{"title":"","publisher":"","url":"","summary":""}]}
List up to 12 notable projects, most famous first. "image" must be a direct image URL from a source page that is allowed to show it (official site, Wikimedia Commons), otherwise leave it empty. Aim for 4-8 direct sources.`;
}
function finish(data: any) {
  const result = parseJson(responseText(data) || outputText(data));
  if (!result) return null;
  const sources = [...(Array.isArray(result.sources) ? result.sources : []), ...directSources(data)]; const seen = new Set<string>();
  result.sources = sources.filter((s: any) => { const u = s?.url; if (!u || /google\.|bing\.com\/search|search\?q=/i.test(u) || seen.has(u)) return false; seen.add(u); return true; }).slice(0, 12);
  return result;
}
const MODELS = () => models(process.env.DRAWUP_SEARCH_MODEL, 'gpt-6-luna', 'gpt-5.6-sol');

// V20: every search is saved (drawup_searches) with its answer. A repeat search of the same words,
// or the same words in another order / with a state abbreviation (query_key), within 30 days returns
// the saved answer right away. Saving never blocks a search.
// V20 speed: a fast call gives a quick answer (or a clarifying question with options) within ~12 s
// while the full sourced research runs in the background (2:00 cap on the page).
const norm = normQuery;
const CACHE_DAYS = 30;
const QUICK_HEAD_START_MS = 3000;
async function saveRow(fields: Record<string, unknown>) {
  try { const r = await adminRest('drawup_searches', { method: 'POST', body: JSON.stringify(fields) }); return r.ok ? (await r.json())[0] : null; } catch { return null; }
}
async function patchRows(filter: string, fields: Record<string, unknown>) {
  try { const r = await adminRest('drawup_searches?' + filter, { method: 'PATCH', body: JSON.stringify(fields) }); return r.ok ? await r.json() : []; } catch { return []; }
}
async function first(path: string) {
  try { const r = await adminRest(path); if (!r.ok) return null; return (await r.json())[0] || null; } catch { return null; }
}
const since = (ms: number) => new Date(Date.now() - ms).toISOString();
async function cached(qn: string, key: string, type: string) {
  const t = `&search_type=eq.${encodeURIComponent(type)}&status=eq.complete&completed_at=gte.${since(CACHE_DAYS * 864e5)}&select=id,result,completed_at,hits,query&order=completed_at.desc&limit=1`;
  const exact = await first(`drawup_searches?query_norm=eq.${encodeURIComponent(qn)}${t}`);
  if (exact) return { ...exact, match: 'exact' };
  const similar = key ? await first(`drawup_searches?query_key=eq.${encodeURIComponent(key)}${t}`) : null;
  return similar ? { ...similar, match: 'similar' } : null;
}
/** A saved clarifying question for these words, with the options people picked most moved to the top. */
async function cachedClarify(qn: string, key: string, type: string) {
  const row = await first(`drawup_searches?or=(query_norm.eq.${encodeURIComponent(qn)},query_key.eq.${encodeURIComponent(key)})&search_type=eq.${encodeURIComponent(type)}&status=eq.clarify&created_at=gte.${since(CACHE_DAYS * 864e5)}&select=clarify&order=created_at.desc&limit=1`);
  const c = row?.clarify;
  if (!c?.question || !Array.isArray(c.options)) return null;
  try {
    const r = await adminRest(`drawup_searches?parent_norm=eq.${encodeURIComponent(qn)}&search_type=eq.${encodeURIComponent(type)}&select=query_norm&limit=200`);
    const picks: Record<string, number> = {};
    if (r.ok) for (const x of await r.json()) picks[x.query_norm] = (picks[x.query_norm] || 0) + 1;
    c.options = c.options.map((o: any) => ({ ...o, picks: picks[norm(String(o.value || ''))] || 0 })).sort((a: any, b: any) => b.picks - a.picks);
  } catch {}
  return c;
}
/** The same search already running (started in the last 110 s): join it instead of starting another. */
async function running(key: string, type: string) {
  return first(`drawup_searches?query_key=eq.${encodeURIComponent(key)}&search_type=eq.${encodeURIComponent(type)}&status=eq.running&response_id=not.is.null&created_at=gte.${since(110e3)}&select=response_id,quick&order=created_at.desc&limit=1`);
}
function summaryFields(result: any) {
  return { title: String(result?.title || '').slice(0, 300) || null, entity_type: String(result?.entity_type || '').slice(0, 40) || null, location: String(result?.location || '').slice(0, 200) || null };
}
const quickOut = (q: QuickResult | null) => q && q.kind === 'answer' ? { answer: q.answer, title: q.title, entity_type: q.entity_type, location: q.location, ms: q.ms, label: 'Quick answer, still checking sources' } : null;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || '').trim().slice(0, 400); const type = String(body?.type || 'all').slice(0, 30);
    if (!query) return NextResponse.json({ error: 'Search query required.' }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Live DrawUp research needs OPENAI_API_KEY in Netlify.' }, { status: 503 });
    const qn = norm(query), key = searchKey(query);
    const parent = body?.parent ? norm(String(body.parent).slice(0, 400)) : null;
    // People lookups and searches the user already clarified never get another question.
    const allowClarify = type !== 'person' && !body?.clarified;
    const user = await signedInUser(request).catch(() => null);
    const base = { query, query_norm: qn, query_key: key, search_type: type, user_id: user?.id || null, parent_norm: parent };
    if (type !== 'person') await recordDetailQuery(query, 'search', user?.id); // V21 Detail Library: detail searches land in the shared detail database
    if (!body?.refresh && qn) {
      const hit = await cached(qn, key, type);
      if (hit?.result) {
        void patchRows(`id=eq.${hit.id}`, { hits: (hit.hits || 1) + 1 });
        void saveRow({ ...base, status: 'cached', result: null, completed_at: new Date().toISOString() });
        return NextResponse.json({ result: hit.result, cached: true, match: hit.match, saved_query: hit.query, saved_at: hit.completed_at });
      }
      if (allowClarify) {
        const c = await cachedClarify(qn, key, type);
        if (c) { void saveRow({ ...base, status: 'clarify', clarify: c, completed_at: new Date().toISOString() }); return NextResponse.json({ clarify: c, cached: true }); }
      }
      const live = await running(key, type);
      if (live?.response_id) return NextResponse.json({ id: live.response_id, status: 'in_progress', quick: live.quick || null, joined: true });
    }
    const log = (fields: Record<string, unknown>) => saveRow({ ...base, ...fields });
    const payload: Record<string, unknown> = { tools: [{ type: 'web_search' }], tool_choice: 'required', input: type === 'person' ? buildPersonPrompt(query) : buildPrompt(query, type) };
    const create = async (extra: Record<string, unknown>) => {
      try { return (await openaiCreate({ ...payload, ...extra }, MODELS())).data; }
      catch (e: any) { if (!/tool_choice/i.test(e?.message || '')) throw e; const { tool_choice: _t, ...rest } = payload; return (await openaiCreate({ ...rest, ...extra }, MODELS())).data; }
    };

    // Quick answer first; the full job starts as soon as the quick call answers (or after a 3 s head start),
    // so a clarifying question normally costs no web research at all.
    const quickP = type === 'person' ? Promise.resolve(null) : quickCall(quickSearchPrompt(query, type, allowClarify), allowClarify);
    const early = await Promise.race([quickP, sleep(QUICK_HEAD_START_MS).then(() => undefined)]);
    const clarifyNow = (q: QuickResult) => q.kind === 'clarify' ? { question: q.question, options: q.options } : null;
    if (early && early.kind === 'clarify') {
      const c = clarifyNow(early);
      await log({ status: 'clarify', clarify: c, completed_at: new Date().toISOString() });
      return NextResponse.json({ clarify: c });
    }
    // V21: stream the researched answer so the page can show fields as they are written; plain background job as fallback.
    const streamed = async () => {
      const go = (p: Record<string, unknown>) => streamCreate(p, MODELS());
      try { return await go({ ...payload, reasoning: { effort: 'low' } }); }
      catch (e: any) {
        if (/reasoning/i.test(e?.message || '')) return await go(payload);
        if (/tool_choice/i.test(e?.message || '')) { const { tool_choice: _t, ...rest } = payload; return await go(rest); }
        throw e;
      }
    };
    const jobP = streamed().catch(() => create({ background: true, store: true })).then(d => ({ d, e: null as any }), e => ({ d: null as any, e }));
    const quick = early === undefined ? await quickP : early;
    const job = await jobP;
    if (quick && quick.kind === 'clarify') {
      if (job.d?.id && job.d.status !== 'completed') void openaiCancel(job.d.id);
      const c = clarifyNow(quick);
      await log({ status: 'clarify', clarify: c, completed_at: new Date().toISOString() });
      return NextResponse.json({ clarify: c });
    }
    const q = quickOut(quick);
    if (job.e && !/background|store/i.test(job.e?.message || '')) throw job.e;
    if (job.d) {
      const data = job.d;
      if (data?.status === 'completed') { const result = finish(data); if (result) { const ingest = await ingestResearch(result, query); if (ingest) result._ingest = ingest; await log({ status: 'complete', result, quick: q, ingest, ...summaryFields(result), completed_at: new Date().toISOString() }); return NextResponse.json({ result }); } }
      if (data?.id) { await log({ status: 'running', response_id: data.id, quick: q }); return NextResponse.json({ id: data.id, status: data.status || 'queued', quick: q, stream: typeof data.cursor === 'number' ? { cursor: data.cursor } : null }); }
    }
    const data = await create({});
    const result = finish(data);
    if (!result) { await log({ status: 'failed', quick: q }); return NextResponse.json({ error: 'Research response could not be structured.' }, { status: 502 }); }
    const ingest = await ingestResearch(result, query); if (ingest) result._ingest = ingest;
    await log({ status: 'complete', result, quick: q, ingest, ...summaryFields(result), completed_at: new Date().toISOString() });
    return NextResponse.json({ result });
  } catch (error: any) { return NextResponse.json({ error: error?.message || 'Live research failed.' }, { status: 502 }); }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(id)) return NextResponse.json({ error: 'Unknown research job.' }, { status: 400 });
  try {
    // V21: streamed jobs hand back the text written since the page's cursor (partial JSON the page reads field by field).
    const after = new URL(request.url).searchParams.get('after');
    if (after !== null) {
      const r = await streamRead(id, Number(after) || 0, 7000).catch(() => null);
      if (r && !r.final && !r.failed) return NextResponse.json({ id, status: 'in_progress', delta: r.text, cursor: r.cursor, activity: r.activity || null });
    }
    const data = await openaiGet(id);
    if (data.status === 'queued' || data.status === 'in_progress') return NextResponse.json({ id, status: data.status });
    const rid = `response_id=eq.${encodeURIComponent(id)}&status=eq.running`;
    if (data.status !== 'completed') { await patchRows(rid, { status: 'failed', completed_at: new Date().toISOString() }); return NextResponse.json({ error: data?.error?.message || 'Research ' + (data.status || 'failed') + '.' }, { status: 502 }); }
    const result = finish(data);
    if (!result) { await patchRows(rid, { status: 'failed', completed_at: new Date().toISOString() }); return NextResponse.json({ error: 'Research response could not be structured.' }, { status: 502 }); }
    // Only the request that flips the row from running to complete lists new firms, so a job is ingested once.
    const won = await patchRows(rid, { status: 'complete', result, ...summaryFields(result), completed_at: new Date().toISOString() });
    if (won.length) await recordDetailSources('search', { text: String(won[0].query || '') }, result.sources); // V21 Detail Library
    if (won.length) {
      const ingest = await ingestResearch(result, String(won[0].query || ''));
      if (ingest) { result._ingest = ingest; await patchRows(`id=eq.${won[0].id}`, { result, ingest }); }
    } else {
      const saved = await first(`drawup_searches?response_id=eq.${encodeURIComponent(id)}&status=eq.complete&select=result&limit=1`);
      if (saved?.result?._ingest) result._ingest = saved.result._ingest;
    }
    return NextResponse.json({ id, status: 'completed', result });
  } catch (error: any) { return NextResponse.json({ error: error?.message || 'Live research failed.' }, { status: 502 }); }
}
