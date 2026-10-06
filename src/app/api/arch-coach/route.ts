import { NextResponse } from 'next/server';
import { creditMessage, missingConfig, outputText, refundCredits, reserveCredits, signedInUser, sourcesFrom, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function needsCurrentResearch(text: string) {
  return /\b(zoning|udo|code|building code|ibc|ada|accessib|permit|ordinance|jurisdiction|occupancy|egress|fire code|energy code|amendment|planning|historic district|setback|parking requirement|architect|engineer|firm|project|product|manufacturer|standard|nfpa|ashrae|icc)\b/i.test(text);
}

// Arch Coach spends the server's AI key, so only signed-in DrawUp sessions may call it,
// and every answered question is charged through the same credit gate as the
// Supabase edge function (reserve before the AI runs, refund if it fails).
function questionCost(text: string, hasImage: boolean) {
  if (hasImage) return { action: 'plan_analysis', cost: 30 };
  if (/\bibc\b|\bicc\b|\bada\b|accessib|building code|egress|occupancy|fire rating|code section|zoning/i.test(text)) return { action: 'code_ada_question', cost: 8 };
  return { action: 'basic_question', cost: 3 };
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof signedInUser>> = null;
  let access: CreditAccess | null = null;
  let action = 'basic_question';
  try {
    user = await signedInUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in to use Arch Coach.' }, { status: 401 });
    const body = await request.json();
    const message = String(body?.message || '').trim();
    const location = String(body?.location || '').trim();
    const image = typeof body?.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(body.image) ? body.image : '';
    const history = (Array.isArray(body?.history) ? body.history : [])
      .filter((x: any) => (x?.role === 'user' || x?.role === 'assistant') && typeof x?.content === 'string')
      .slice(-16) as ChatTurn[];
    if (!message) return NextResponse.json({ error: 'Message required.' }, { status: 400 });

    const notReady = missingConfig();
    if (notReady) return NextResponse.json({ error: 'Arch Coach is not connected yet: ' + notReady }, { status: 503 });

    const transcript = history.map(t => `${t.role === 'user' ? 'USER' : 'ARCH COACH'}: ${t.content}`).join('\n');
    const combined = `${transcript}\nPROJECT LOCATION FIELD: ${location || '(not separately supplied)'}`;
    const research = needsCurrentResearch(combined);
    const jurisdictionSpecific = /\b(zoning|udo|building code|ibc|ada|permit|ordinance|jurisdiction|occupancy|egress|fire code|energy code|setback|parking requirement)\b/i.test(combined);
    const locationClue = Boolean(location) || /\b(?:in|at|for)\s+[A-Z][A-Za-z .'-]{2,}(?:,\s*[A-Z]{2})?\b/.test(transcript) || /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(transcript);
    if (jurisdictionSpecific && !locationClue) {
      return NextResponse.json({ answer: 'Where is the project located (city, state/province, and country)? I need the project jurisdiction before I give you a zoning, code, accessibility, egress, or permitting answer.', sources: [], needs_location: true, researched: false });
    }
    const priced = questionCost(message, !!image);
    action = priced.action;
    access = await reserveCredits(user, priced.cost, action);
    if (!access.ok) return NextResponse.json({ error: creditMessage(access, priced.cost), ...access }, { status: 402 });

    const instructions = `You are Arch Coach, DrawUp's AEC copilot. Be useful, concise, professional, and practical. Preserve context from the entire conversation. Never ask for information the user already supplied in the conversation. If a user gives a location as a follow-up, connect it to the earlier question automatically. For jurisdiction-specific zoning, code, ADA, permitting, standards, firms, projects, products, or other current facts, research current sources and answer from them. Prefer official government/AHJ/code/institutional sources first, then authoritative AEC sources. Clearly distinguish a binding requirement from guidance or a recommendation. Do not claim a design is code compliant; note that final interpretation/approval belongs to the applicable licensed professionals and AHJ when relevant. Do not tell the user to Google something. Answer the question first, then give the useful details. Do not mention internal model names, API keys, credits, or implementation details.`;

    const input = `${instructions}\n\nCONVERSATION:\n${transcript || `USER: ${message}`}\n${location ? `\nPROJECT LOCATION: ${location}` : ''}\n\nRespond to the user's latest message in context.`;
    const configured = process.env.DRAWUP_COACH_MODEL || process.env.DRAWUP_SEARCH_MODEL;
    const models = [...new Set([configured, 'gpt-5.6-sol', 'gpt-5'].filter(Boolean))] as string[];
    let lastError = 'Arch Coach request failed.';

    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const apiKey = process.env.OPENAI_API_KEY;
    for (const model of models) {
      const payload: any = image ? { model, input: [{ role: 'user', content: [{ type: 'input_text', text: input }, { type: 'input_image', image_url: image }] }] } : { model, input };
      if (research) payload.tools = [{ type: 'web_search' }];
      const response = await fetch(base + '/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { lastError = data?.error?.message || `OpenAI returned ${response.status}.`; continue; }
      const answer = outputText(data);
      if (!answer) { lastError = 'Arch Coach returned an empty response.'; continue; }
      return NextResponse.json({ answer, sources: sourcesFrom(data), researched: research, credits_charged: access.credits_charged ?? 0, credits_remaining: access.credits_remaining ?? null });
    }
    await refundCredits(user.id, access, action);
    return NextResponse.json({ error: lastError + ' You were not charged.' }, { status: 502 });
  } catch (error: any) {
    console.error('Arch Coach API error', error);
    if (user && access) await refundCredits(user.id, access, action);
    return NextResponse.json({ error: error?.message || 'Arch Coach request failed.' }, { status: 500 });
  }
}
