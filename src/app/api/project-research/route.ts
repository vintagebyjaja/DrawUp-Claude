import { NextResponse } from 'next/server';
import { models, openaiCreate, openaiGet, outputText as responseText } from '@/lib/drawup-server';

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
{"title":"","entity_type":"project|firm|university|person|resource|answer","type":"","location":"","summary":"","answer":"","architect":"","engineers":"","contractor":"","owner":"","opened":"","completed":"","area":"","cost":"","capacity":"","story":"","design_highlights":[""],"items":[{"title":"","subtitle":"","summary":"","url":""}],"sources":[{"title":"","publisher":"","url":"","summary":"","image":""}]}
For list/question searches, put a concise direct answer in answer and the actual results in items. For entity searches, fill the applicable profile fields. Aim for 3-8 direct useful sources. For a project/building, also find a legitimate project photograph or rendering from an official architect, engineer, contractor, owner/venue, university, or reputable architecture/construction publication and return it as top-level "image" when available. Include architecture, structural/civil/MEP engineering, contractor/construction manager, owner/developer, cost, schedule, area, capacity and construction/design highlights whenever the sources support them. Treat AEC as Architecture + Engineering + Construction equally.
Work like a researcher: run several web searches (the name, the name plus city, the architect or contractor's own project page, and recent news) before answering. Never answer from memory alone, and keep searching until you have at least 4 direct sources when they exist.`;
}
function finish(data: any) {
  const result = parseJson(responseText(data) || outputText(data));
  if (!result) return null;
  const sources = [...(Array.isArray(result.sources) ? result.sources : []), ...directSources(data)]; const seen = new Set<string>();
  result.sources = sources.filter((s: any) => { const u = s?.url; if (!u || /google\.|bing\.com\/search|search\?q=/i.test(u) || seen.has(u)) return false; seen.add(u); return true; }).slice(0, 12);
  return result;
}
const MODELS = () => models(process.env.DRAWUP_SEARCH_MODEL, 'gpt-6-luna', 'gpt-5.6-sol');

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || '').trim().slice(0, 400); const type = String(body?.type || 'all').slice(0, 30);
    if (!query) return NextResponse.json({ error: 'Search query required.' }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'Live DrawUp research needs OPENAI_API_KEY in Netlify.' }, { status: 503 });
    const payload: Record<string, unknown> = { tools: [{ type: 'web_search' }], tool_choice: 'required', input: buildPrompt(query, type) };
    const create = async (extra: Record<string, unknown>) => {
      try { return (await openaiCreate({ ...payload, ...extra }, MODELS())).data; }
      catch (e: any) { if (!/tool_choice/i.test(e?.message || '')) throw e; const { tool_choice: _t, ...rest } = payload; return (await openaiCreate({ ...rest, ...extra }, MODELS())).data; }
    };
    try {
      const data = await create({ background: true, store: true });
      if (data?.status === 'completed') { const result = finish(data); if (result) return NextResponse.json({ result }); }
      if (data?.id) return NextResponse.json({ id: data.id, status: data.status || 'queued' });
    } catch (e: any) {
      if (!/background|store/i.test(e?.message || '')) throw e;
    }
    const data = await create({});
    const result = finish(data);
    if (!result) return NextResponse.json({ error: 'Research response could not be structured.' }, { status: 502 });
    return NextResponse.json({ result });
  } catch (error: any) { return NextResponse.json({ error: error?.message || 'Live research failed.' }, { status: 502 }); }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{6,120}$/.test(id)) return NextResponse.json({ error: 'Unknown research job.' }, { status: 400 });
  try {
    const data = await openaiGet(id);
    if (data.status === 'queued' || data.status === 'in_progress') return NextResponse.json({ id, status: data.status });
    if (data.status !== 'completed') return NextResponse.json({ error: data?.error?.message || 'Research ' + (data.status || 'failed') + '.' }, { status: 502 });
    const result = finish(data);
    if (!result) return NextResponse.json({ error: 'Research response could not be structured.' }, { status: 502 });
    return NextResponse.json({ id, status: 'completed', result });
  } catch (error: any) { return NextResponse.json({ error: error?.message || 'Live research failed.' }, { status: 502 }); }
}
