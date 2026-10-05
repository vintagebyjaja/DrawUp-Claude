import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function outputText(data: any) {
  if (data?.output_text) return data.output_text;
  return (data?.output || [])
    .flatMap((o: any) => o?.content || [])
    .filter((c: any) => c?.type === 'output_text' || typeof c?.text === 'string')
    .map((c: any) => c?.text || '')
    .join('\n')
    .trim();
}

function sourcesFrom(data: any) {
  const found: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      for (const ann of content?.annotations || []) {
        const c = ann?.url_citation || ann;
        const url = c?.url;
        if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
          seen.add(url);
          found.push({ title: c?.title || 'Source', url });
        }
      }
    }
  }
  return found.slice(0, 8);
}

function needsCurrentResearch(text: string) {
  return /\b(zoning|udo|code|building code|ibc|ada|accessib|permit|ordinance|jurisdiction|occupancy|egress|fire code|energy code|amendment|planning|historic district|setback|parking requirement|architect|engineer|firm|project|product|manufacturer|standard|nfpa|ashrae|icc)\b/i.test(text);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = String(body?.message || '').trim();
    const location = String(body?.location || '').trim();
    const image = typeof body?.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(body.image) ? body.image : '';
    const history = (Array.isArray(body?.history) ? body.history : [])
      .filter((x: any) => (x?.role === 'user' || x?.role === 'assistant') && typeof x?.content === 'string')
      .slice(-16) as ChatTurn[];
    if (!message) return NextResponse.json({ error: 'Message required.' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Arch Coach is not connected to the server AI key.' }, { status: 503 });

    const transcript = history.map(t => `${t.role === 'user' ? 'USER' : 'ARCH COACH'}: ${t.content}`).join('\n');
    const combined = `${transcript}\nPROJECT LOCATION FIELD: ${location || '(not separately supplied)'}`;
    const research = needsCurrentResearch(combined);
    const instructions = `You are Arch Coach, DrawUp's AEC copilot. Be useful, concise, professional, and practical. Preserve context from the entire conversation. Never ask for information the user already supplied in the conversation. If a user gives a location as a follow-up, connect it to the earlier question automatically. For jurisdiction-specific zoning, code, ADA, permitting, standards, firms, projects, products, or other current facts, research current sources and answer from them. Prefer official government/AHJ/code/institutional sources first, then authoritative AEC sources. Clearly distinguish a binding requirement from guidance or a recommendation. Do not claim a design is code compliant; note that final interpretation/approval belongs to the applicable licensed professionals and AHJ when relevant. Do not tell the user to Google something. Answer the question first, then give the useful details. Do not mention internal model names, API keys, credits, or implementation details.`;

    const input = `${instructions}\n\nCONVERSATION:\n${transcript || `USER: ${message}`}\n${location ? `\nPROJECT LOCATION: ${location}` : ''}\n\nRespond to the user's latest message in context.`;
    const configured = process.env.DRAWUP_COACH_MODEL || process.env.DRAWUP_SEARCH_MODEL;
    const models = [...new Set([configured, 'gpt-5.6-sol', 'gpt-5'].filter(Boolean))] as string[];
    let lastError = 'Arch Coach request failed.';

    for (const model of models) {
      const payload: any = image ? { model, input: [{ role: 'user', content: [{ type: 'input_text', text: input }, { type: 'input_image', image_url: image }] }] } : { model, input };
      if (research) payload.tools = [{ type: 'web_search' }];
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { lastError = data?.error?.message || `OpenAI returned ${response.status}.`; continue; }
      const answer = outputText(data);
      if (!answer) { lastError = 'Arch Coach returned an empty response.'; continue; }
      return NextResponse.json({ answer, sources: sourcesFrom(data), researched: research });
    }
    return NextResponse.json({ error: lastError }, { status: 502 });
  } catch (error: any) {
    console.error('Arch Coach API error', error);
    return NextResponse.json({ error: error?.message || 'Arch Coach request failed.' }, { status: 500 });
  }
}
