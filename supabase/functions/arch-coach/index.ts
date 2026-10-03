import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

const SYSTEM_PROMPT = `You are Arch Coach, DrawUp's AEC assistant. Help architects, engineers, interior designers, planners, construction professionals and students understand the built environment.

SOURCE PRIORITY
1. For building-code questions, identify the project jurisdiction and adopted code edition before giving a project-specific conclusion. Prefer official/current sources from the International Code Council (IBC/IRC and related ICC codes), the applicable state/local amendments and the authority having jurisdiction. Clearly name code edition and section when verified. Do not invent a section number.
2. For accessibility, prioritize the official U.S. DOJ ADA Standards and applicable adopted accessibility/building-code provisions. Distinguish ADA civil-rights requirements from model-code accessibility requirements.
3. For construction/detail education, use established architectural principles and legally accessible/licensed references. Francis D.K. Ching works such as Building Construction Illustrated and Building Codes Illustrated may be named as educational references, but never reproduce copyrighted pages, figures or drawings from unauthorized PDFs. If the user uploads material they are authorized to use, analyze that supplied material within the request. Otherwise create an ORIGINAL schematic/detail.
4. When web research is enabled, prefer primary official sources and identify uncertainty.

JURISDICTION
If a question depends on code, zoning, ADA application, climate, permitting, structural criteria or local requirements and project location is missing, ask: "Where is the project located (city, state/province, and country)? That may change the answer." Do not waste time generating a jurisdiction-specific answer first.

DRAWINGS + DETAILS
When asked for a drawing or detail, explain the assembly in construction order, label key layers/components, call out typical coordination items, and provide an original schematic concept rather than copying a published detail. State what must be verified by the responsible licensed professional, manufacturer and AHJ. If a visual mode is requested, tailor the explanation for that visual.

PROFESSIONAL LIMIT
You are guidance, not the architect/engineer of record or AHJ. Never call an output permit-ready or guaranteed code-compliant. The responsible professional and AHJ make final determinations.`;

function classify(message:string, visual:string){
  const m=message.toLowerCase(); let action='basic_question', cost=3;
  if(/large|entire|full set|drawing set|specification|document analysis/.test(m)){action='large_document_analysis';cost=150;}
  else if(/photoreal|render|rendering/.test(m)){action='photoreal_render';cost=100;}
  else if(/compliance report|code report|full code review/.test(m)){action='code_compliance_report';cost=75;}
  else if(/space plan|space-plan|layout generation|programming layout/.test(m)){action='space_planning';cost=50;}
  else if(/detail|wall section|roof section|window head|window sill|parapet|flashing/.test(m)){action='detail_generation';cost=35;}
  else if(/upload|plan analysis|analyze.*plan|review.*plan/.test(m)){action='plan_analysis';cost=30;}
  else if(/\bibc\b|\bicc\b|\bada\b|accessib|building code|egress|occupancy|fire rating|code section/.test(m)){action='code_ada_question';cost=8;}
  if(visual==='3d') cost+=25;
  if(visual==='hologram') cost+=50;
  return {action,cost};
}
function needsLocation(message:string){return /\bibc\b|\bicc\b|\bada\b|accessib|building code|zoning|egress|occupancy|permit|fire rating|structural|wind|snow|seismic|climate/.test(message.toLowerCase());}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  try{
    console.log('[arch-coach] request start');
    const openaiKey=Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl=Deno.env.get('SUPABASE_URL');
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!openaiKey||!supabaseUrl||!serviceKey) throw new Error('Missing required server secret (OPENAI_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY).');
    const auth=req.headers.get('Authorization')||'';
    const token=auth.replace(/^Bearer\s+/i,'');
    if(!token) return json({error:'Please start a DrawUp session.'},401);
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user) return json({error:'Your DrawUp session could not be verified.'},401);
    const body=await req.json();
    const message=String(body?.message||'').trim();
    const location=String(body?.location||'').trim();
    const visual=String(body?.visual_mode||'standard');
    if(!message) return json({error:'Ask Arch Coach a question first.'},400);

    if(needsLocation(message)&&!location){
      return json({answer:'Where is the project located (city, state/province, and country)? That may change the code, accessibility, climate, or permitting answer.',needs_location:true,credits_charged:0});
    }

    const {action,cost}=classify(message,visual);
    const isAnonymous=Boolean((user as any).is_anonymous);
    if(isAnonymous && (visual==='3d'||visual==='hologram')) return json({error:'Create a free Explore account to use 3D or hologram detail generation. Your free account starts with 50 credits.'},402);

    console.log('[arch-coach] reserve',{user:user.id,isAnonymous,action,cost});
    const {data:access,error:accessError}=await admin.rpc('reserve_arch_coach_v11_access',{p_user_id:user.id,p_is_anonymous:isAnonymous,p_cost:cost,p_action:action,p_thread_id:null});
    if(accessError) throw new Error('Credit reservation failed: '+accessError.message);
    if(!access?.ok) return json({error:access?.code==='INSUFFICIENT_CREDITS'?`This action needs about ${cost} credits. You have ${access?.credits_remaining??0}.`:'Your free Arch Coach allowance has been used.',...access},402);

    const userText=`Project location: ${location||'not provided'}\nRequested visual mode: ${visual}\nEstimated DrawUp action: ${action}\n\nUser question: ${message}`;
    const tools:any[]=[{type:'web_search'}];
    if(visual==='3d'||visual==='hologram') tools.push({type:'image_generation'});
    console.log('[arch-coach] OpenAI request',{action,visual});
    const ai=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENAI_MODEL')||'gpt-5.6-sol',instructions:SYSTEM_PROMPT,input:userText,tools})});
    const payload=await ai.json();
    if(!ai.ok){console.error('[arch-coach] OpenAI error',payload);throw new Error(payload?.error?.message||'OpenAI request failed.');}
    const answer=payload.output_text||payload.output?.filter((x:any)=>x.type==='message').flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('\n')||'Arch Coach completed the request.';
    const imageCall=payload.output?.find((x:any)=>x.type==='image_generation_call');
    console.log('[arch-coach] success',{action,cost});
    return json({answer,image_base64:imageCall?.result||null,action,estimated_cost:cost,...access});
  }catch(err){console.error('[arch-coach] fatal',err);return json({error:err instanceof Error?err.message:String(err),stage:'arch-coach-v11'},500);}
});
