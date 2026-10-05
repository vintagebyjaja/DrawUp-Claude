import { NextResponse } from 'next/server';

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

export async function POST(request: Request) {
  try {
    const body=await request.json(); const query=body?.query; const type=body?.type||'all';
    if (!query || typeof query !== 'string') return NextResponse.json({ error: 'Search query required.' }, { status: 400 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Live DrawUp research needs OPENAI_API_KEY in Netlify.' }, { status: 503 });

    const prompt = `You are DrawUp Search, an AEC research engine. Research this exact user query on the live web: "${query}". Filter hint: ${type}.
Do NOT assume this is a project. Classify it as project/building, firm, person, university/program, code/resource, detail/product, list/comparison, or general AEC question.
Do the research FOR the user. Never send them to Google/Bing/search-result pages and never tell them to add more words when a reasonable answer can be found.
Prioritize direct and useful sources: architecture/engineering/contractor/owner/developer project pages; ArchDaily; Dezeen; ENR; Architect Magazine; official universities and accreditation bodies; government/code sources; institutional/venue pages; reputable local/national news. For a known building/project, gather enough facts to make a polished DrawUp profile. For a firm, make a firm profile. For a question/list, answer the question directly with useful sourced items.
Only state facts supported by pages you found. Omit unknown fields. Do not discuss whether DrawUp has verified something. Do not say information is not public unless a source explicitly says that.
Return ONLY JSON:
{"title":"","entity_type":"project|firm|university|person|resource|answer","type":"","location":"","summary":"","answer":"","architect":"","engineers":"","contractor":"","owner":"","opened":"","completed":"","area":"","cost":"","capacity":"","story":"","design_highlights":[""],"items":[{"title":"","subtitle":"","summary":"","url":""}],"sources":[{"title":"","publisher":"","url":"","summary":""}]}
For list/question searches, put a concise direct answer in answer and the actual results in items. For entity searches, fill the applicable profile fields. Aim for 3-8 direct useful sources.`;

    const models=[process.env.DRAWUP_SEARCH_MODEL,'gpt-6-luna','gpt-5.6-sol'].filter(Boolean) as string[];
    let last:any=null;
    for(const model of [...new Set(models)]){
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,tools:[{type:'web_search'}],input:prompt})});
      const data=await response.json();
      if(!response.ok){last=data;continue;}
      const result=parseJson(outputText(data));
      if(!result){last={error:{message:'Research response could not be structured.'}};continue;}
      const sources=[...(Array.isArray(result.sources)?result.sources:[]),...directSources(data)]; const seen=new Set<string>();
      result.sources=sources.filter((s:any)=>{const u=s?.url;if(!u||/google\.|bing\.com\/search|search\?q=/i.test(u)||seen.has(u))return false;seen.add(u);return true}).slice(0,10);
      return NextResponse.json({result});
    }
    return NextResponse.json({error:last?.error?.message||'Live research request failed.'},{status:502});
  } catch (error:any) { return NextResponse.json({ error: error?.message || 'Live research failed.' }, { status: 500 }); }
}
