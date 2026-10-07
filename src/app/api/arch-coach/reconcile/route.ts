import { NextResponse } from 'next/server';
import { adminRest, openaiGet, outputText, sourcesFrom, refundOnce, signedInUser, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function rows(path: string) {
  const r = await adminRest(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function patch(table:string,id:string,body:any){
  await adminRest(`${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(body)});
}
async function insert(table:string,body:any){
  await adminRest(table,{method:'POST',body:JSON.stringify(body)});
}

async function reconcileOne(j:any){
  try{
    const data=await openaiGet(j.response_id);
    if(data.status==='queued'||data.status==='in_progress') return false;
    const answer=(data.status==='completed'||data.status==='incomplete')?outputText(data):'';
    if(!answer){
      await refundOnce(j.owner_id,j.access as CreditAccess,j.action,j.response_id).catch(()=>{});
      await patch('arch_coach_jobs',j.id,{status:'failed',error:'Full answer did not complete.',updated_at:new Date().toISOString(),completed_at:new Date().toISOString()});
      if(j.assistant_message_id) await patch('coach_messages',j.assistant_message_id,{answer_status:'quick_available_full_failed'});
      await insert('drawup_notifications',{user_id:j.owner_id,kind:'arch_coach',title:'Arch Coach kept your quick answer',body:'The deeper verification could not finish, but your quick answer is still saved.',href:j.thread_id?`#portal/arch-coach?thread=${j.thread_id}`:'#portal/arch-coach',ref_id:j.id});
      return true;
    }
    const sources=sourcesFrom(data), sourceText=sources.length?'\n\nSources:\n'+sources.map((s:any)=>`• ${s.title||'Source'} — ${s.url}`).join('\n'):'';
    await patch('arch_coach_jobs',j.id,{status:'completed',full_answer:answer,sources,updated_at:new Date().toISOString(),completed_at:new Date().toISOString()});
    if(j.assistant_message_id) await patch('coach_messages',j.assistant_message_id,{content:answer+sourceText,answer_status:'full_complete',sources});
    await insert('drawup_notifications',{user_id:j.owner_id,kind:'arch_coach',title:'Your full Arch Coach answer is ready',body:'Arch Coach finished the deeper verification and saved it to your thread.',href:j.thread_id?`#portal/arch-coach?thread=${j.thread_id}`:'#portal/arch-coach',ref_id:j.id});
    return true;
  }catch{return false;}
}

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET||'';
  const auth=request.headers.get('authorization')||'';
  const isCron=!!secret && auth===`Bearer ${secret}`;
  const user=isCron?null:await signedInUser(request);
  if(!isCron&&!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const owner=user?`&owner_id=eq.${encodeURIComponent(user.id)}`:'';
  const jobs=await rows(`arch_coach_jobs?status=eq.processing${owner}&select=*&order=created_at.asc&limit=25`);
  let finished=0; for(const j of jobs) if(await reconcileOne(j)) finished++;
  return NextResponse.json({ok:true,checked:jobs.length,finished});
}
