import OpenAI from "npm:openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:{...corsHeaders,"Content-Type":"application/json"}});

Deno.serve(async (req) => {
  if(req.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method !== "POST") return json({error:"POST only"},405);
  try{
    const key=Deno.env.get("OPENAI_API_KEY");
    if(!key) return json({error:"Search research is not configured."},500);
    const body=await req.json().catch(()=>({}));
    const query=String(body?.query||"").trim();
    if(!query || query.length>300) return json({error:"Enter a shorter search."},400);
    console.log("[drawup-search] start", {query_length:query.length, type:body?.type||"all"});
    const openai=new OpenAI({apiKey:key});
    const response=await openai.responses.create({
      model:Deno.env.get("OPENAI_SEARCH_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-5",
      tools:[{type:"web_search"}],
      instructions:`You power DrawUp AEC project search. Research the user's building/project/firm/university/resource query using trustworthy sources, prioritizing official owner, architect, engineer, contractor, university, government, professional organization, and manufacturer sites. Never provide a Google search URL. Never invent project team credits. Return ONLY valid compact JSON with this schema: {"title":"","location":"","type":"","opened":"","architect":"","engineers":"","contractor":"","owner":"","summary":"","sources":[["Source label","https://direct-source-url"],["Source label","https://direct-source-url"]]}. Omit or use empty strings for facts you cannot verify. Sources must be direct pages actually supporting the result. Keep summary under 70 words.`,
      input:`DrawUp search: ${query}`,
    });
    const text=(response.output_text||"").trim().replace(/^```json\s*/i,"").replace(/```$/," ").trim();
    let result; try{result=JSON.parse(text)}catch{console.error("[drawup-search] JSON parse failed",text.slice(0,500));return json({error:"Trusted-source research did not return a structured result."},502)}
    if(Array.isArray(result.sources)) result.sources=result.sources.filter((x:any)=>Array.isArray(x)&&/^https?:\/\//i.test(String(x[1]||""))&&!/google\./i.test(String(x[1]||""))).slice(0,6);
    console.log("[drawup-search] success", {title:result.title||query, sources:result.sources?.length||0});
    return json({ok:true,result});
  }catch(error){console.error("[drawup-search] fatal",error);return json({error:"DrawUp search could not complete trusted-source research right now.",detail:String(error)},500)}
});
