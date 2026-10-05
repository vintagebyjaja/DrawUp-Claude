import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const { query, type = 'all' } = await request.json();
    if (!query || typeof query !== 'string') return NextResponse.json({ error: 'Search query required.' }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Project research is not configured.' }, { status: 503 });

    const prompt = `Research the AEC/building/place query: "${query}". Requested category: ${type}.
Use web search. Do the research for the user; NEVER return Google/Bing search-result URLs or tell the user to research it themselves.
Prioritize direct project pages and credible AEC sources: architect/engineer/contractor/owner/developer pages, ArchDaily, Dezeen, ENR, Architect Magazine, city/government documents, venue/institution pages, and reputable local/national news.
Only include facts supported by sources you actually found. Omit unknown fields. Do not say information is "not public" unless a source explicitly establishes that.
Return ONLY valid JSON with this shape:
{"title":"","type":"","location":"","summary":"","architect":"","engineers":"","contractor":"","owner":"","opened":"","completed":"","area":"","cost":"","capacity":"","story":"","design_highlights":[""],"sources":[{"title":"","publisher":"","url":"","summary":""}]}
Sources must be direct pages about this specific project/building whenever possible, not search pages. Aim for 3-8 useful sources. If only one useful direct source exists, return it and the facts it supports.`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.DRAWUP_SEARCH_MODEL || 'gpt-5.6-luna',
        tools: [{ type: 'web_search', search_context_size: 'high' }],
        input: prompt
      })
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || 'Research request failed.' }, { status: response.status });

    const text = data.output_text || (data.output || []).flatMap((o:any)=>o.content || []).filter((c:any)=>c.type === 'output_text').map((c:any)=>c.text).join('\n');
    const result = parseJson(text || '');
    if (!result) return NextResponse.json({ error: 'Research response could not be structured.' }, { status: 502 });

    // Preserve direct citation URLs returned by web search if the model omitted them from JSON.
    const citationSources:any[] = [];
    for (const item of data.output || []) for (const content of item.content || []) for (const ann of content.annotations || []) {
      const c = ann.url_citation || ann;
      if (c?.url && !/google\.|bing\.com\/search/i.test(c.url)) citationSources.push({ title: c.title || 'Project source', publisher: '', url: c.url, summary: '' });
    }
    const seen = new Set((result.sources || []).map((s:any)=>s.url).filter(Boolean));
    for (const s of citationSources) if (!seen.has(s.url)) { (result.sources ||= []).push(s); seen.add(s.url); }
    result.sources = (result.sources || []).filter((s:any)=>s?.url && !/google\.|bing\.com\/search/i.test(s.url)).slice(0, 10);
    return NextResponse.json({ result });
  } catch (error:any) {
    return NextResponse.json({ error: error?.message || 'Project research failed.' }, { status: 500 });
  }
}
