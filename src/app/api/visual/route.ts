import { adminRest, creditMessage, missingConfig, models, openaiBackground, openaiGet, outputText, readTicket, refundOnce, reserveCredits, signTicket, signedInUser, type CreditAccess } from '@/lib/drawup-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// V28 Visual answers: the YouTube part. When a member asks the AI Team or Arch Coach a visual question and picks
// "YouTube", this route finds real videos on the topic, checks each one with YouTube's public oEmbed endpoint (so a
// made-up or private video is never shown), and keeps the link, title, channel and thumbnail in learn_videos so they
// show in Arch Coach > Learning > Watch & Learn. DrawUp never downloads or hosts a video: the page embeds YouTube's own
// player (youtube-nocookie.com) or links to the video and channel.
//   videos { videos: { q, topic } } -> { status: 'done', videos } (topic already found, or YouTube Data API key set)
//                                    | { status: 'running', ticket } (AI web search on youtube.com, background job)
//   poll   { poll: <ticket> }       -> { status: 'running' } | { status: 'done', videos } | { error, final: true }
// Settings (optional): DRAWUP_YOUTUBE_API_KEY (YouTube Data API v3 key: faster, free within Google's daily quota),
// DRAWUP_VISUAL_VIDEO_COST (default 1 credit, only for the AI search path), DRAWUP_VISUAL_MODEL (default gpt-5-mini).
// The pictures (DrawUp library + Wikimedia Commons) and the Sketch / 3D / Construction Detail views run in the browser
// and through the existing /api/details/draw route, so they need nothing here.

const TICKET_MAX_AGE_MS = 6 * 3600 * 1000;
const MAX_VIDEOS = 6;
const REUSE_DAYS = 45;
const ID_RE = /^[\w-]{11}$/;

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const price = (name: string, d: number) => Math.max(0, Math.round(Number(process.env[name]) || (process.env[name] === '0' ? 0 : d)));
/** Same topic, same row: lower case, words only, sorted, so "Window sill detail" and "detail of a window sill" match. */
const topicKey = (t: string) => [...new Set(String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))].sort().join(' ').slice(0, 120);
const STOP = new Set(['the', 'and', 'for', 'what', 'how', 'does', 'should', 'look', 'like', 'show', 'with', 'can', 'you', 'that', 'this', 'are', 'its', 'about', 'from', 'into', 'drawing', 'video', 'videos', 'youtube', 'explained', 'tutorial']);

/** The 11-character id of a YouTube video link, or ''. Only watch, youtu.be, shorts, embed and live links count. */
function videoIdOf(u: string) {
  try {
    const x = new URL(u), h = x.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      const v = x.searchParams.get('v') || '';
      if (x.pathname === '/watch' && ID_RE.test(v)) return v;
      const m = x.pathname.match(/^\/(shorts|embed|live)\/([\w-]{11})/); if (m) return m[2];
    }
    if (h === 'youtu.be') { const m = x.pathname.match(/^\/([\w-]{11})/); if (m) return m[1]; }
  } catch { /* not a link */ }
  return '';
}

type Video = { video_id: string; title: string; channel_title: string; channel_url: string; thumbnail_url: string; url: string };

/** YouTube's public oEmbed answers only for real, public, embeddable videos. Its title and channel are the truth. */
async function oembed(id: string): Promise<Video | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const o: any = await r.json();
    const channelUrl = /^https:\/\/(www\.)?youtube\.com\//.test(String(o?.author_url || '')) ? String(o.author_url) : '';
    return { video_id: id, title: str(o?.title, 200) || 'YouTube video', channel_title: str(o?.author_name, 120), channel_url: channelUrl, thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: 'https://www.youtube.com/watch?v=' + id };
  } catch { return null; }
}

async function rows<T = any>(q: string): Promise<T[]> { const r = await adminRest(q); return r.ok ? ((await r.json()) || []) : []; }

/** Keeps the videos for Watch & Learn and remembers that this member asked (their "From your questions" shelf). */
async function keep(videos: Video[], userId: string, topic: string, question: string, source: string) {
  if (!videos.length) return { saved: false };
  const key = topicKey(topic), at = new Date().toISOString();
  const up = await adminRest('learn_videos?on_conflict=video_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(videos.map(v => ({ ...v, topic: str(topic, 120), topic_key: key, source, last_asked_at: at, created_by: userId }))),
  });
  if (!up.ok) { console.warn('[drawup] learn_videos save failed (run the v28 SQL)', await up.text().catch(() => '')); return { saved: false }; }
  await adminRest('learn_video_asks?on_conflict=user_id,video_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(videos.map(v => ({ user_id: userId, video_id: v.video_id, question: str(question, 300), topic: str(topic, 120), created_at: at }))),
  }).catch(() => null);
  return { saved: true };
}

async function viaYouTubeApi(q: string): Promise<Video[] | null> {
  const key = process.env.DRAWUP_YOUTUBE_API_KEY;
  if (!key) return null;
  const u = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=strict&relevanceLanguage=en&maxResults=${MAX_VIDEOS + 2}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) { console.warn('[drawup] YouTube API', r.status); return null; }
    const d: any = await r.json();
    return (d?.items || []).map((it: any) => {
      const id = String(it?.id?.videoId || ''), sn = it?.snippet || {};
      if (!ID_RE.test(id)) return null;
      return { video_id: id, title: str(sn.title, 200).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), channel_title: str(sn.channelTitle, 120), channel_url: sn.channelId ? 'https://www.youtube.com/channel/' + sn.channelId : '', thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: 'https://www.youtube.com/watch?v=' + id };
    }).filter(Boolean).slice(0, MAX_VIDEOS);
  } catch { return null; }
}

const SEARCH_INSTRUCTIONS = `You find good YouTube videos that teach an architecture, engineering or construction topic to a DrawUp member (students and professionals).
Search youtube.com for the topic. Prefer clear explanations, real drawing walkthroughs, field installation videos from manufacturers, trade schools, universities, building-science educators and practicing architects. Avoid clickbait, unrelated vlogs, shorts with no teaching, and anything unsafe.
Return only videos whose watch link you actually saw in the search results. Never make up a link or a video id. 3 to 6 videos, best first.`;
const SEARCH_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['videos'],
  properties: { videos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['url', 'title', 'why'], properties: { url: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } } } } },
};

export async function POST(request: Request) {
  const user = await signedInUser(request);
  if (!user || user.is_anonymous) return json({ error: 'Sign in to find videos.' }, 401);
  const notReady = missingConfig();
  if (notReady) return json({ error: 'Video search is not connected yet: ' + notReady }, 503);
  const body = await request.json().catch(() => ({}));
  if (typeof body?.poll === 'string') return poll(user, body.poll);
  const v = body?.videos || {};
  const topic = str(v.topic || v.q, 120), question = str(v.q || v.topic, 600);
  if (topic.length < 3) return json({ error: 'Say what you want a video about.' }, 400);

  // 1. Already found for this topic: reuse (free, instant), and add them to this member's shelf.
  const key = topicKey(topic);
  if (key) {
    const since = new Date(Date.now() - REUSE_DAYS * 864e5).toISOString();
    const have = await rows<Video>(`learn_videos?topic_key=eq.${encodeURIComponent(key)}&hidden=eq.false&last_asked_at=gte.${encodeURIComponent(since)}&select=video_id,title,channel_title,channel_url,thumbnail_url,url&order=last_asked_at.desc&limit=${MAX_VIDEOS}`);
    if (have.length >= 3) { await keep(have, user.id, topic, question, 'ai_answer'); return json({ status: 'done', videos: have, reused: true, saved: true }); }
  }
  // 2. YouTube Data API, when a key is set (no AI cost).
  const api = await viaYouTubeApi(topic);
  if (api && api.length) { const k = await keep(api, user.id, topic, question, 'ai_answer'); return json({ status: 'done', videos: api, saved: k.saved }); }

  // 3. AI web search restricted to youtube.com, as a background job (Cloudflare CPU pattern).
  const cost = price('DRAWUP_VISUAL_VIDEO_COST', 1);
  const access: CreditAccess = await reserveCredits(user, cost, 'visual_videos');
  if (!access.ok) return json({ error: creditMessage(access, cost), ...access }, 402);
  const payload = (filtered: boolean) => ({
    instructions: SEARCH_INSTRUCTIONS,
    input: `TOPIC: ${topic}\nTHE MEMBER ASKED: ${question}`,
    tools: [filtered ? { type: 'web_search', filters: { allowed_domains: ['youtube.com'] } } : { type: 'web_search' }],
    include: ['web_search_call.action.sources'],
    reasoning: { effort: 'low' }, max_output_tokens: 4000,
    text: { format: { type: 'json_schema', name: 'drawup_videos', strict: true, schema: SEARCH_SCHEMA } },
  });
  const list = models(process.env.DRAWUP_VISUAL_MODEL, 'gpt-5-mini', 'gpt-5');
  let made: { id: string; model: string };
  try { made = await openaiBackground(payload(true), list); }
  catch (e: any) {
    try { if (!/filter|allowed_domains/i.test(e?.message || '')) throw e; made = await openaiBackground(payload(false), list); }
    catch (e2: any) { await refundOnce(user.id, access, 'visual_videos_refund', 'start:' + Date.now()); return json({ error: (e2?.message || 'Video search could not start.') + ' You were not charged.' }, 502); }
  }
  return json({ status: 'running', ticket: signTicket({ v: 1, k: 'videos', u: user.id, r: made.id, t: Date.now(), topic, q: question, a: access }), credits_charged: access.credits_charged ?? 0 });
}

async function poll(user: { id: string }, ticket: string) {
  const t = readTicket<any>(ticket);
  if (!t || t.v !== 1 || t.k !== 'videos' || t.u !== user.id || !t.r) return json({ error: 'That video search is not yours.', final: true }, 403);
  if (Date.now() - Number(t.t || 0) > TICKET_MAX_AGE_MS) return json({ error: 'That video search expired. Try again.', final: true }, 410);
  let data: any;
  try { data = await openaiGet(t.r); } catch { return json({ status: 'running', retry: true }); }
  if (data?.status === 'queued' || data?.status === 'in_progress') return json({ status: 'running' });
  const fail = async (why: string) => { await refundOnce(user.id, t.a, 'visual_videos_refund', t.r); return json({ error: `No videos this time: ${why}. You were not charged.`, final: true }, 502); };
  if (data?.status !== 'completed') return fail(data?.error?.message || 'the search did not finish');
  let parsed: any = null;
  try { parsed = JSON.parse(outputText(data)); } catch { return fail('the answer came back unreadable'); }
  // Only ids the search really returned (sources + citations) count; then YouTube itself must confirm each one.
  const seen = new Set<string>();
  for (const item of data?.output || []) {
    for (const src of item?.action?.sources || []) { const id = videoIdOf(String(src?.url || '')); if (id) seen.add(id); }
    for (const c of item?.content || []) for (const a of c?.annotations || []) { const id = videoIdOf(String(a?.url || '')); if (id) seen.add(id); }
  }
  const ids = [...new Set((Array.isArray(parsed?.videos) ? parsed.videos : []).map((x: any) => videoIdOf(String(x?.url || ''))).filter((id: string) => id && (seen.size === 0 || seen.has(id))))].slice(0, MAX_VIDEOS) as string[];
  const checked = (await Promise.all(ids.map(oembed))).filter(Boolean) as Video[];
  if (!checked.length) return fail('no public video could be confirmed on YouTube');
  const k = await keep(checked, user.id, t.topic, t.q, 'ai_answer');
  return json({ status: 'done', videos: checked, saved: k.saved, credits_charged: t.a?.credits_charged ?? 0 });
}
