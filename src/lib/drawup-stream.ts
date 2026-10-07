// V21 streaming: long AI answers (Arch Coach, DrawUp Search, Check) show text as it is written
// instead of all at once at the end. The job still runs as an OpenAI background response, so no
// request ever has to stay open for the whole answer. Each page poll reads the events that arrived
// since its cursor for a few seconds (GET /responses/{id}?stream=true&starting_after=N), returns the
// new text, and the page appends it. Server-only (uses the OpenAI key).

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

type SseEvent = { type: string; sequence_number?: number; [k: string]: any };

/** Reads server-sent events from a fetch body until `stop` returns true, the budget runs out or the stream ends. */
async function readSse(res: Response, budgetMs: number, onEvent: (e: SseEvent) => boolean | void, ctrl: AbortController) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const dec = new TextDecoder();
  let buf = '';
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let cut: number;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
        if (!data || data === '[DONE]') continue;
        let e: SseEvent;
        try { e = JSON.parse(data); } catch { continue; }
        if (onEvent(e) === true) { clearTimeout(timer); ctrl.abort(); return; }
      }
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') throw err;
  } finally {
    clearTimeout(timer);
    try { reader.releaseLock(); } catch {}
  }
}

/**
 * Starts a background response with streaming turned on and returns its id as soon as the service
 * accepts it. The connection is then dropped: background responses keep running and their events stay
 * readable from the start. Tries each model like openaiCreate. Throws when streaming is not accepted,
 * so callers can fall back to a plain background job.
 */
export async function streamCreate(payload: Record<string, unknown>, modelList: string[]) {
  let last = 'The AI request failed.';
  for (const model of modelList) {
    const ctrl = new AbortController();
    const r = await fetch(OPENAI_BASE + '/responses', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...payload, model, background: true, store: true, stream: true }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      last = data?.error?.message || `The AI service returned ${r.status}.`;
      if ([400, 404].includes(r.status) && /model/i.test(last) && !/stream|background/i.test(last)) continue;
      throw new Error(last);
    }
    let id = '', status = 'queued', cursor = 0;
    await readSse(r, 20000, e => {
      if (typeof e.sequence_number === 'number') cursor = e.sequence_number;
      if (e.response?.id) { id = e.response.id; status = e.response.status || status; return true; }
    }, ctrl);
    if (!id) throw new Error('The AI service did not start the streamed answer.');
    return { id, status, cursor, model };
  }
  throw new Error(last);
}

export type StreamRead = {
  text: string;            // new answer text since the cursor
  cursor: number;          // pass back as `after` next time
  activity?: string;       // what the model is doing (searching the web, writing…)
  final?: any;             // the full response object once it completed
  failed?: string;         // the job failed or was cancelled
};

/** Reads what arrived after `after` for up to `budgetMs`. Returns early when the response finishes. */
export async function streamRead(id: string, after: number, budgetMs = 7000): Promise<StreamRead> {
  const ctrl = new AbortController();
  const r = await fetch(`${OPENAI_BASE}/responses/${encodeURIComponent(id)}?stream=true&starting_after=${Math.max(0, after | 0)}`, {
    signal: ctrl.signal, cache: 'no-store',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, Accept: 'text/event-stream' },
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data?.error?.message || `The AI service returned ${r.status}.`);
  }
  const out: StreamRead = { text: '', cursor: after };
  let firstText = 0;
  await readSse(r, budgetMs, e => {
    if (typeof e.sequence_number === 'number') {
      if (e.sequence_number <= after) return; // already delivered
      out.cursor = e.sequence_number;
    }
    switch (e.type) {
      case 'response.output_text.delta':
        out.text += e.delta || ''; out.activity = 'writing';
        // hand text to the page about once a second instead of holding it for the whole read
        if (!firstText) firstText = Date.now(); else if (Date.now() - firstText > 900) return true;
        break;
      case 'response.web_search_call.in_progress':
      case 'response.web_search_call.searching': out.activity = 'searching'; break;
      case 'response.web_search_call.completed': out.activity = 'read_sources'; break;
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning.delta': if (!out.activity) out.activity = 'thinking'; break;
      case 'response.completed': out.final = e.response; return true;
      case 'response.failed':
      case 'response.incomplete':
      case 'response.cancelled': out.failed = e.response?.error?.message || e.type.replace('response.', ''); if (e.type === 'response.incomplete' && e.response) out.final = e.response; return true;
      case 'error': out.failed = e.message || 'The AI service reported an error.'; return true;
    }
  }, ctrl);
  return out;
}

/** Retries an OpenAI payload without optional speed settings a model may not accept. */
export function withoutSpeedHints(payload: Record<string, unknown>) {
  const { reasoning: _r, ...rest } = payload as any;
  return rest;
}
