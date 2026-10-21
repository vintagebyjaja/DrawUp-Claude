/* DrawUp V25 AI Design Team: Teammate, 6th Man and Arch Coach in ONE conversation.
 * Portal tab #portal/ai-team (registered with DrawUpPortal.registerTab).
 * - One thread per conversation, shared by all three (coach_threads / coach_messages with a `speaker`), so old
 *   Arch Coach threads open here too and nothing is split into separate histories.
 * - Replies stream from /api/team/chat (NDJSON) word by word; Stop keeps the partial text, Continue asks again.
 *   You can send more messages while a reply or a background task is running.
 * - Background tasks (Coach's requirement check, 6th Man "take the shot", layout options, drawing-set updates)
 *   come from /api/team/jobs; their results attach to the question they answer.
 * - The Locker Room (locker_items), Project Memory (team_memory) and preferences (team_preferences) are read and
 *   written with the member's own session (RLS).
 * - "Add to this set" hands comments to Draw it up (window.DrawUpDrawIt.open, from the Draw it up thread);
 *   "Add to project" saves them to the project's memory.
 * window.DrawUpTeam = { open(opts), projectCard(host, projectId), ask(text, assistant) }
 */
(function () {
  'use strict';
  if (window.DrawUpTeam) return;
  const NAMES = { teammate: 'Teammate', sixth_man: '6th Man', coach: 'Arch Coach' };
  const ROLE = { teammate: 'Design partner', sixth_man: 'The game changer', coach: 'Head coach' };
  const ICON = { teammate: '◆', sixth_man: '6', coach: '✦' };
  const STYLES = [['professional', 'Professional'], ['casual', 'Casual'], ['creative', 'Creative'], ['direct', 'Straight to the point']];
  const KINDS = { idea: 'Idea', bookmark: 'Bookmark', decision: 'Decision', rejected: 'Rejected', play: '6th Man play', finding: 'Coach finding', note: 'Note', unfinished: 'Unfinished', proposal: 'Proposal' };
  const STARTERS = [
    ['teammate', 'Teammate, this lobby feels too tight. What can we do?'],
    ['sixth_man', '6th Man, check in.'],
    ['sixth_man', '6th Man, draw up a play for the entry sequence.'],
    ['coach', 'Coach, can this corridor be four feet wide?'],
  ];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = () => window.DrawUpPortal;
  const C = () => P()?.ctx?.() || {};
  const sb = () => C().client || window.drawupSupabaseClient;
  const toast = (m, bad) => (C().toast ? C().toast(m, bad) : console[bad ? 'warn' : 'log'](m));
  const uid = () => C().user?.id || '';
  const token = async () => (await sb()?.auth.getSession())?.data?.session?.access_token || '';
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^A-Za-z0-9_-]/g, '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const firstLine = (t, n = 90) => { const s = String(t || '').replace(/[#*_>`]/g, '').split('\n').map(x => x.trim()).find(Boolean) || 'Saved from the AI Design Team'; return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const when = d => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

  /* ------------------------------------------------------------------ Markdown (safe, progressive) */
  function inline(s) {
    return s.replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t, u) => `<a href="${u.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${t}</a>`);
  }
  function md(src) {
    const lines = esc(src).split('\n'), out = [];
    let list = null, para = [], table = null, code = null;
    const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join('<br>')) + '</p>'); para = []; } };
    const flushL = () => { if (list) { out.push(`<${list.t}>${list.items.map(i => '<li>' + inline(i) + '</li>').join('')}</${list.t}>`); list = null; } };
    const flushT = () => { if (table) { const [h, ...rows] = table; out.push('<div class="du-tm25-tablewrap"><table><thead><tr>' + h.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'); table = null; } };
    for (const raw of lines) {
      const l = raw.replace(/\s+$/, '');
      if (code != null) { if (/^```/.test(l)) { out.push('<pre><code>' + code.join('\n') + '</code></pre>'); code = null; } else code.push(l); continue; }
      if (/^```/.test(l)) { flushP(); flushL(); flushT(); code = []; continue; }
      if (/^\|.*\|$/.test(l)) { flushP(); flushL(); if (/^\|[\s:|-]+\|$/.test(l)) continue; (table = table || []).push(l.slice(1, -1).split('|').map(c => c.trim())); continue; }
      flushT();
      let m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { flushP(); flushL(); out.push(`<h${Math.min(6, m[1].length + 2)}>${inline(m[2])}</h${Math.min(6, m[1].length + 2)}>`); continue; }
      if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
      if (!l.trim()) { flushP(); flushL(); continue; }
      flushL(); para.push(l);
    }
    if (code != null) out.push('<pre><code>' + code.join('\n') + '</code></pre>');
    flushP(); flushL(); flushT();
    return out.join('');
  }

  /* ------------------------------------------------------------------ routing mirror (only for the placeholder label; the server decides) */
  function guessSpeaker(text, selected) {
    const t = String(text || '');
    const head = t.replace(/^\s*(?:(?:hey|yo|ok|okay|alright|aight|so|and|now|but)[\s,]+)?/i, '').slice(0, 40), tail = ' ' + t.slice(-28);
    const tests = [['sixth_man', /(?:6th|sixth|six)[\s-]*man/i], ['coach', /(?:arch[\s-]*coach|coach)/i], ['teammate', /(?:team[\s-]*mate|teammate)/i]];
    for (const [s, re] of tests) if (new RegExp('^\\s*' + re.source, 'i').test(head) || new RegExp('[,!.?\\s]' + re.source + '\\s*[?!.]*\\s*$', 'i').test(tail)) return s;
    if (/\b(draw (?:me )?up a play|take the shot|get in here)\b/i.test(t)) return 'sixth_man';
    return selected;
  }

  /* ------------------------------------------------------------------ state */
  const S = {
    host: null, threads: [], projects: [], thread: null, projectId: '', messages: [], jobs: [], allJobs: [], prefs: null, costs: null, voice: false,
    selected: store.get('du-tm25-assistant', 'teammate'), credits: null, unlimited: false, view: 'chat', streams: new Map(), picked: new Set(),
    schemaMissing: false, pollTimer: 0, globalTimer: 0, pending: [], railOpen: false, memory: [], locker: [], lockerFilter: 'all', seen: store.get('du-tm25-seen', {}),
  };

  async function loadConfig() {
    if (S.costs) return;
    try { const r = await fetch('/api/team/config'); const d = await r.json(); S.costs = d.costs; S.voice = !!d.voice; } catch (_) { S.costs = { chat: 1, shot: 8, layout: 8, image: 30, coach_basic: 3, coach_code: 8 }; }
  }
  async function loadPrefs() {
    const { data } = await sb().from('team_preferences').select('*').eq('user_id', uid()).maybeSingle().then(x => x, () => ({ data: null }));
    S.prefs = Object.assign({ style: 'casual', sixth_man_aware: true, coach_aware: true, concise: true, speak_replies: false }, data || {});
  }
  async function savePrefs(patch) {
    Object.assign(S.prefs, patch);
    const r = await sb().from('team_preferences').upsert({ user_id: uid(), ...S.prefs, updated_at: new Date().toISOString() });
    if (r.error) toast('Preferences could not be saved: ' + r.error.message, true); else toast('Saved.');
  }
  async function loadCredits() {
    try {
      const { data } = await sb().from('arch_coach_credit_accounts').select('monthly_credits_remaining,purchased_credits_remaining,unlimited_access').eq('user_id', uid()).maybeSingle();
      if (data) { S.unlimited = !!data.unlimited_access; S.credits = (data.monthly_credits_remaining || 0) + (data.purchased_credits_remaining || 0); }
    } catch (_) {}
  }
  async function loadThreads() {
    let r = await sb().from('coach_threads').select('id,title,project_thread_id,updated_at,team').eq('owner_id', uid()).order('updated_at', { ascending: false }).limit(60);
    if (r.error && /team/i.test(r.error.message)) { S.schemaMissing = true; r = await sb().from('coach_threads').select('id,title,project_thread_id,updated_at').eq('owner_id', uid()).order('updated_at', { ascending: false }).limit(60); }
    S.threads = r.data || [];
    const p = await sb().from('project_threads').select('id,project_name,location,firm_id').eq('owner_id', uid()).order('updated_at', { ascending: false }).limit(100);
    S.projects = p.data || [];
  }
  async function loadMessages() {
    if (!S.thread) { S.messages = []; return; }
    let r = await sb().from('coach_messages').select('id,role,content,created_at,speaker,status,reply_to,meta,attachments').eq('thread_id', S.thread.id).order('created_at').limit(400);
    if (r.error && /column/i.test(r.error.message)) { S.schemaMissing = true; r = await sb().from('coach_messages').select('id,role,content,created_at').eq('thread_id', S.thread.id).order('created_at').limit(400); }
    if (r.error) throw r.error;
    // Keep bubbles that are still streaming on this page (the database has them as empty).
    const live = new Map([...S.streams.values()].map(s => [s.msgId, s]));
    S.messages = (r.data || []).map(m => live.has(m.id) ? { ...m, content: live.get(m.id).text, status: 'streaming' } : m);
    for (const s of S.streams.values()) if (s.threadId === S.thread.id && !S.messages.some(m => m.id === s.msgId)) S.messages.push(...s.local);
  }
  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token(), ...(opts.headers || {}) } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(d.error || 'Request failed (' + res.status + ')'), { data: d, status: res.status });
    return d;
  }
  async function loadJobs() {
    if (!S.thread) { S.jobs = []; return; }
    try { const d = await api('/api/team/jobs?thread_id=' + S.thread.id); S.jobs = d.jobs || []; } catch (_) { S.jobs = []; }
  }
  const projectName = id => S.projects.find(p => p.id === id)?.project_name || '';
  const activeProjectId = () => S.thread ? (S.thread.project_thread_id || '') : S.projectId;

  /* ------------------------------------------------------------------ shell */
  async function render(w, opts = {}) {
    S.host = w;
    w.innerHTML = '<div class="du-loading">THE TEAM IS WARMING UP…</div>';
    await Promise.all([loadConfig(), loadPrefs(), loadCredits(), loadThreads()]);
    const q = new URLSearchParams((location.hash.split('?')[1] || ''));
    const want = opts.threadId || q.get('thread') || '';
    if (opts.projectId) S.projectId = opts.projectId;
    S.thread = want ? (S.threads.find(t => t.id === want) || null) : (opts.fresh ? null : S.thread && S.threads.find(t => t.id === S.thread.id) || null);
    if (opts.view) S.view = opts.view;
    await Promise.all([loadMessages(), loadJobs()]);
    draw();
    if (opts.ask) send(opts.ask, { assistant: opts.assistant });
    else if (opts.prefill) { const i = w.querySelector('#du-tm25-input'); if (i) { i.value = opts.prefill; i.focus(); } }
    schedulePoll(); globalPoll();
  }

  function draw() {
    const w = S.host; if (!w || !w.isConnected) return;
    // Redraws never lose what the member is typing.
    const old = w.querySelector('#du-tm25-input'), typed = old ? old.value : null, focused = old && document.activeElement === old;
    const oldBox = w.querySelector('#du-tm25-msgs'), atEnd = !oldBox || oldBox.scrollHeight - oldBox.scrollTop - oldBox.clientHeight < 160, keepTop = oldBox?.scrollTop;
    const pid = activeProjectId();
    const running = S.allJobs.filter(j => j.status === 'running' || j.status === 'finishing').length || S.jobs.filter(j => j.status === 'running' || j.status === 'finishing').length;
    const unseen = S.allJobs.filter(j => (j.status === 'completed' || j.status === 'failed') && !S.seen[j.id]).length;
    w.innerHTML = `<div class="du-tm25 ${S.railOpen ? 'rail-open' : ''}">
      <aside class="du-tm25-rail" aria-label="AI Design Team navigation">
        <button class="du-btn primary du-tm25-new" type="button" data-act="new">＋ New conversation</button>
        <nav class="du-tm25-nav">
          ${[['chat', '◆', 'Conversation'], ['locker', '▣', 'The Locker Room'], ['memory', '◎', 'Project Memory'], ['jobs', '⟳', 'Active Generations' + (running ? ` (${running})` : '')]].map(x => `<button type="button" data-view="${x[0]}" class="${S.view === x[0] ? 'on' : ''}"><span>${x[1]}</span>${esc(x[2])}</button>`).join('')}
        </nav>
        <div class="du-tm25-kicker">CONVERSATION HISTORY</div>
        <div class="du-tm25-threads">${S.threads.map(t => `<button type="button" data-thread="${t.id}" class="${S.thread && S.thread.id === t.id ? 'on' : ''}"><b>${esc(t.title || 'New conversation')}</b><small>${esc(projectName(t.project_thread_id) || 'General')}${t.team === false ? ' · Arch Coach' : ''} · ${esc(when(t.updated_at))}</small></button>`).join('') || '<p class="du-muted">Your conversations appear here.</p>'}</div>
      </aside>
      <section class="du-tm25-main">
        <header class="du-tm25-head">
          <button type="button" class="du-tm25-railbtn" data-act="rail" aria-label="Open the team menu">☰</button>
          <div class="du-tm25-title"><span class="du-kicker">AI DESIGN TEAM</span>
            <h1>${esc(S.thread?.title || 'New conversation')}</h1>
            <label class="du-tm25-proj">Project <select id="du-tm25-project"><option value="">General (no project)</option>${S.projects.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select></label>
          </div>
          <div class="du-tm25-headstats">
            <span class="du-tm25-pill" title="Who you are talking to">${ICON[S.selected]} ${esc(NAMES[S.selected])}</span>
            <span class="du-tm25-pill" id="du-tm25-credits">${S.unlimited ? 'Unlimited credits' : S.credits == null ? '—' : S.credits + ' credits'}</span>
            <button type="button" class="du-tm25-pill" data-view="jobs" title="Background tasks">⟳ ${running} running</button>
            <button type="button" class="du-tm25-pill du-tm25-bell" data-act="bell" aria-label="Notifications">🔔${unseen ? `<i>${unseen}</i>` : ''}</button>
            <button type="button" class="du-tm25-pill" data-act="settings" aria-label="Team settings">⚙</button>
          </div>
        </header>
        <div class="du-tm25-bench">${benchHtml()}</div>
        ${S.schemaMissing ? '<p class="du-tm25-warn">The AI Design Team database update is not installed yet. Run the v25 SQL files in Supabase (see the v25 note), then refresh.</p>' : ''}
        <div class="du-tm25-body">${S.view === 'chat' ? chatHtml() : S.view === 'locker' ? '<div id="du-tm25-locker" class="du-tm25-panel"><div class="du-loading">Opening the Locker Room…</div></div>' : S.view === 'memory' ? '<div id="du-tm25-memory" class="du-tm25-panel"><div class="du-loading">Loading project memory…</div></div>' : '<div id="du-tm25-jobs" class="du-tm25-panel"></div>'}</div>
        ${S.view === 'chat' ? composerHtml() : ''}
      </section>
    </div>`;
    bind(w);
    const inp = w.querySelector('#du-tm25-input');
    if (inp && typed) inp.value = typed;
    if (inp && focused) inp.focus();
    if (S.view === 'chat') { if (atEnd) scrollEnd(true); else { const box = w.querySelector('#du-tm25-msgs'); if (box) box.scrollTop = keepTop; } }
    if (S.view === 'locker') renderLocker();
    if (S.view === 'memory') renderMemory();
    if (S.view === 'jobs') renderJobs();
  }

  function benchHtml() {
    // Statuses show only what is actually happening.
    const six = [...S.streams.values()].find(s => s.speaker === 'sixth_man' && s.threadId === S.thread?.id);
    const sixJob = S.jobs.find(j => j.kind === 'sixth_man_shot' && j.status === 'running');
    const lastSix = [...S.messages].reverse().find(m => m.role === 'assistant' && m.speaker === 'sixth_man');
    const lastUser = [...S.messages].reverse().find(m => m.role === 'user');
    let st = 'On the Bench', cls = 'bench';
    if (six && !six.text) { st = 'Reviewing Context'; cls = 'review'; }
    else if (six || sixJob) { st = 'In the Game'; cls = 'game'; }
    else if (lastSix?.meta?.plays?.length && (!lastUser || new Date(lastSix.created_at) > new Date(lastUser.created_at))) { st = 'Play Ready'; cls = 'ready'; }
    const coachBusy = [...S.streams.values()].some(s => s.speaker === 'coach' && s.threadId === S.thread?.id) || S.jobs.some(j => j.kind === 'coach_verify' && j.status === 'running');
    return `<div class="du-tm25-six ${cls}" title="6th Man stays on the bench until you call him"><span class="du-tm25-jersey">6</span><b>6th Man</b><span>${st}${S.prefs && !S.prefs.sixth_man_aware ? ' · standby awareness off' : ''}</span></div>
      <div class="du-tm25-coachst"><span>✦</span><b>Arch Coach</b><span>${coachBusy ? 'Checking requirements' : 'Ready'}${S.prefs && !S.prefs.coach_aware ? ' · awareness off' : ''}</span></div>`;
  }

  function chatHtml() {
    if (!S.messages.length) return `<div class="du-tm25-empty"><h2>The whole team is here.</h2>
      <p><b>Teammate</b> brainstorms and builds with you. <b>6th Man</b> waits on the bench until you call for another play. <b>Arch Coach</b> handles codes, details and reviews. One conversation, shared memory.</p>
      <div class="du-tm25-starters">${STARTERS.map(([s, t]) => `<button type="button" data-starter="${esc(t)}" data-as="${s}"><span class="du-tm25-av ${s}">${ICON[s]}</span>${esc(t)}</button>`).join('')}</div>
      <p class="du-muted">Teammate and 6th Man are included on the Free plan (${S.costs?.chat ?? 1} credit a message). Arch Coach uses its usual prices.</p></div>`;
    const byId = new Map(S.messages.map(m => [m.id, m]));
    const anchorOf = m => m.meta?.job_id && m.role === 'assistant' && m.meta?.job_kind ? (m.meta.completion_of && byId.has(m.meta.completion_of) ? m.meta.completion_of : null) : null;
    const attached = new Map();
    for (const m of S.messages) { const a = anchorOf(m); if (a) (attached.get(a) || attached.set(a, []).get(a)).push(m); }
    const jobsAt = new Map();
    for (const j of S.jobs) if (j.status !== 'completed') { const a = j.input?.reply_message_id && byId.has(j.input.reply_message_id) ? j.input.reply_message_id : j.request_message_id; (jobsAt.get(a) || jobsAt.set(a, []).get(a)).push(j); }
    let html = '';
    for (const m of S.messages) {
      if (anchorOf(m)) continue;
      html += msgHtml(m, byId);
      for (const c of attached.get(m.id) || []) html += msgHtml(c, byId, true);
      for (const j of jobsAt.get(m.id) || []) html += jobHtml(j);
    }
    return `<div class="du-tm25-msgs" id="du-tm25-msgs" aria-live="polite">${html}</div>${trayHtml()}`;
  }

  function msgHtml(m, byId, completion) {
    const sp = m.role === 'user' ? 'user' : (m.speaker || 'coach');
    const picked = S.picked.has(m.id);
    const meta = m.meta || {};
    const live = m.status === 'streaming';
    const q = completion && m.reply_to && byId.get(m.reply_to);
    const label = m.role === 'user' ? 'YOU' + (meta.to && meta.to !== 'teammate' ? ' → ' + NAMES[meta.to].toUpperCase() : '') : NAMES[sp]?.toUpperCase() || 'ARCH COACH';
    const badges = [];
    if (meta.preliminary) badges.push(S.messages.some(x => x.meta?.completion_of === m.id || (x.reply_to && x.reply_to === m.reply_to && x.meta?.verified))
      ? '<span class="du-tm25-badge prelim">Quick answer · verified result below</span>'
      : '<span class="du-tm25-badge prelim">Quick answer · verifying</span>');
    if (meta.verified) badges.push('<span class="du-tm25-badge ok">✓ Verified with sources</span>');
    if (meta.job_kind === 'sixth_man_shot') badges.push('<span class="du-tm25-badge six">Detailed proposal</span>');
    if (meta.job_kind === 'layout_option') badges.push('<span class="du-tm25-badge">Layout option</span>');
    if (meta.continued_from) badges.push('<span class="du-tm25-badge">Continued (new generation)</span>');
    if (m.status === 'stopped') badges.push('<span class="du-tm25-badge warn">Stopped</span>');
    if (m.status === 'failed') badges.push('<span class="du-tm25-badge bad">Not answered</span>');
    if (meta.queued_changes?.length) badges.push('<span class="du-tm25-badge warn">Changes queued for the next revision</span>');
    const atts = (m.attachments || []).length ? `<div class="du-tm25-atts">${m.attachments.map(a => `<span>🖼 ${esc(a.name)}</span>`).join('')}</div>` : '';
    const body = live && !m.content ? '<span class="du-tm25-typing" aria-label="Writing"><i></i><i></i><i></i></span>' : md(m.content || '');
    let extra = '';
    if (!live && m.role === 'assistant' && m.status !== 'failed') {
      if (meta.plays?.length) extra += `<div class="du-tm25-plays">${meta.plays.map((p, i) => `<article><span class="du-kicker">PLAY ${i + 1}</span><h4>${esc(p.title)}</h4><p>${esc(p.summary)}</p><div><button type="button" class="du-btn primary" data-shot="${i}" data-msg="${m.id}">Take the shot (${S.costs?.shot ?? 8} cr)</button><button type="button" class="du-btn ghost" data-saveplay="${i}" data-msg="${m.id}">Save play</button></div></article>`).join('')}</div>`;
      if (meta.proposal) extra += proposalHtml(m);
      if (meta.decision) extra += `<div class="du-tm25-decision">Decision: <b>${esc(meta.decision)}</b> <button type="button" class="du-btn ghost" data-decide="${m.id}">✓ Approve &amp; save decision</button></div>`;
      if (meta.queued_changes?.length) extra += `<div class="du-tm25-queued"><b>Queued for the next revision</b><ul>${meta.queued_changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>${meta.job_id ? `<button type="button" class="du-btn ghost" data-revise="${meta.job_id}">Run the revision</button>` : ''}</div>`;
      if (meta.suggestions?.length) extra += `<div class="du-tm25-next"><span>Next:</span>${meta.suggestions.map((s, i) => `<button type="button" data-sugg="${i}" data-msg="${m.id}">${s.kind === 'handoff' ? '↪ ' : s.kind === 'save' ? '▣ ' : s.kind === 'add_to_set' ? '✎ ' : s.kind === 'add_to_project' ? '＋ ' : ''}${esc(s.label)}</button>`).join('')}</div>`;
    }
    const acts = live ? `<button type="button" data-stop="${m.id}">■ Stop</button>`
      : m.role === 'assistant' ? `${m.status === 'stopped' ? `<button type="button" data-continue="${m.id}">↻ Continue</button>` : ''}<button type="button" data-save="${m.id}" data-kind="idea">Save idea</button><button type="button" data-save="${m.id}" data-kind="bookmark">Bookmark</button><button type="button" data-toset="${m.id}">Add to set</button><button type="button" data-toproj="${m.id}">Add to project</button>${['teammate', 'sixth_man', 'coach'].filter(s => s !== sp).map(s => `<button type="button" data-handoff="${s}" data-msg="${m.id}">Ask ${NAMES[s]}</button>`).join('')}${m.role === 'assistant' && m.content && 'speechSynthesis' in window ? `<button type="button" data-speak="${m.id}" aria-label="Read aloud">🔊</button>` : ''}`
      : `<button type="button" data-save="${m.id}" data-kind="note">Save note</button>`;
    return `<article class="du-tm25-msg ${sp} ${completion ? 'completion' : ''} ${picked ? 'picked' : ''}" data-id="${m.id}">
      <label class="du-tm25-pick" title="Select to add to a set or project"><input type="checkbox" data-pick="${m.id}" ${picked ? 'checked' : ''}><span class="du-sr">Select</span></label>
      <div class="du-tm25-av ${sp}" aria-hidden="true">${m.role === 'user' ? 'YOU'.slice(0, 1) : ICON[sp]}</div>
      <div class="du-tm25-bubble">
        ${q ? `<div class="du-tm25-attached">↳ Completed result for your question: “${esc(firstLine(q.content, 80))}”</div>` : ''}
        <header><b>${esc(label)}</b>${badges.join('')}<time>${esc(when(m.created_at))}</time></header>
        <div class="du-tm25-text">${body}</div>${atts}${extra}
        <div class="du-tm25-acts">${acts}</div>
      </div></article>`;
  }

  function proposalHtml(m) {
    const p = m.meta.proposal;
    return `<div class="du-tm25-proposal"><span class="du-kicker">PROPOSED CHANGE · NOT APPLIED YET</span><h4>${esc(p.title)}</h4>
      <ol>${p.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
      ${p.keep?.length ? `<p><b>Keep:</b> ${p.keep.map(esc).join('; ')}</p>` : ''}
      ${p.questions?.length ? `<p class="du-tm25-q"><b>To confirm first:</b> ${p.questions.map(esc).join(' ')}</p>` : ''}
      <div class="du-tm25-proprow"><button type="button" class="du-btn primary" data-apply="${m.id}">Approve &amp; apply to a drawing set</button><button type="button" class="du-btn ghost" data-saveprop="${m.id}">Save as idea</button><button type="button" class="du-btn ghost" data-reject="${m.id}">Not this one</button></div>
      <p class="du-muted">Applying sends these changes to Draw it up, which saves a new version and marks redlines against the previous one. Nothing changes until you approve.</p></div>`;
  }

  function jobHtml(j) {
    const secs = Math.max(0, Math.round((Date.now() - new Date(j.created_at).getTime()) / 1000));
    const st = { running: 'In progress', finishing: 'Finishing', failed: 'Did not finish', canceled: 'Canceled', completed: 'Done' }[j.status] || j.status;
    return `<div class="du-tm25-job ${j.status}" data-job="${j.id}">
      <div class="du-tm25-jobhead"><span class="du-tm25-av ${j.speaker}">${ICON[j.speaker] || '⟳'}</span><b>${esc(j.title)}</b><span class="du-tm25-badge ${j.status === 'running' ? 'prelim' : j.status === 'failed' ? 'bad' : ''}">${st}</span>${j.status === 'running' ? `<small>${secs < 90 ? secs + 's' : Math.round(secs / 60) + ' min'}</small>` : ''}</div>
      ${j.status === 'running' ? `<div class="du-tm25-bar"><i></i></div><p class="du-muted">${j.kind === 'coach_verify' ? 'Checking applicable accessibility, egress and code requirements. Keep chatting; the verified answer will attach to your question.' : j.kind === 'drawing_set' ? 'Draw it up is making the new version. It will show here when the set is saved.' : 'Running in the background. Keep chatting; the result will attach here.'}</p>` : ''}
      ${j.error ? `<p class="du-tm25-err">${esc(j.error)}</p>` : ''}
      ${(j.queued_changes || []).length ? `<p class="du-muted"><b>Queued for the next revision:</b> ${j.queued_changes.map(esc).join('; ')}</p>` : ''}
      <div class="du-tm25-proprow">
        ${j.status === 'running' && j.kind !== 'drawing_set' ? `<form data-amend="${j.id}" class="du-tm25-amend"><input name="c" placeholder="Add a change (queued for the next revision)" aria-label="Add a change"><button class="du-btn ghost">Add</button></form><button type="button" class="du-btn ghost" data-cancel="${j.id}">Cancel task</button>` : ''}
        ${['failed', 'canceled'].includes(j.status) && j.kind !== 'drawing_set' ? `<button type="button" class="du-btn primary" data-retry="${j.id}">Retry</button>` : ''}
      </div></div>`;
  }

  function trayHtml() {
    if (!S.picked.size) return '';
    return `<div class="du-tm25-tray" role="region" aria-label="Selected messages"><b>${S.picked.size} selected</b>
      <button type="button" class="du-btn primary" data-act="pick-set">Add to drawing set…</button>
      <button type="button" class="du-btn ghost" data-act="pick-proj">Add to project…</button>
      <button type="button" class="du-btn ghost" data-act="pick-locker">Save to Locker Room</button>
      <button type="button" class="du-btn ghost" data-act="pick-clear">Clear</button></div>`;
  }

  function composerHtml() {
    const c = S.costs || {};
    const cost = S.selected === 'coach' ? `${c.coach_basic ?? 3} credits (${c.coach_code ?? 8} for code / ADA questions)` : `${c.chat ?? 1} credit per message`;
    const sr = window.SpeechRecognition || window.webkitSpeechRecognition;
    return `<form class="du-tm25-compose" id="du-tm25-form">
      <div class="du-tm25-who" role="radiogroup" aria-label="Talk to">${['teammate', 'sixth_man', 'coach'].map(s => `<button type="button" role="radio" aria-checked="${S.selected === s}" data-pickas="${s}" class="${s}"><span class="du-tm25-av ${s}">${ICON[s]}</span><span><b>${NAMES[s]}</b><small>${ROLE[s]}</small></span></button>`).join('')}</div>
      <div id="du-tm25-files" class="du-tm25-files"></div>
      <div class="du-tm25-row">
        <label class="du-tm25-attach" title="Attach pictures (up to 3)">＋<input type="file" id="du-tm25-file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>
        <textarea id="du-tm25-input" rows="2" placeholder="Talk to ${esc(NAMES[S.selected])}… (or start with “Coach,” or “6th Man,”)" aria-label="Message"></textarea>
        ${S.voice && sr ? '<button type="button" class="du-tm25-mic" data-act="mic" aria-label="Talk instead of typing">🎙</button>' : ''}
        <button class="du-btn primary du-tm25-send" type="submit">Send</button>
      </div>
      <div class="du-tm25-hint"><span>${esc(NAMES[S.selected])} · ${esc(cost)}${c.image ? ` · with a picture ${c.image}` : ''}</span><span>${[...S.streams.values()].length ? `<button type="button" data-act="stopall">■ Stop generating</button>` : ''}</span></div>
    </form>`;
  }

  function scrollEnd(force) {
    const box = S.host?.querySelector('#du-tm25-msgs'); if (!box) return;
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    if (force || near) box.scrollTop = box.scrollHeight;
  }

  /* ------------------------------------------------------------------ sending + streaming */
  let files = [];
  async function readImage(f) {
    const url = URL.createObjectURL(f), img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error(f.name + ' could not be read.')); img.src = url; });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    } finally { URL.revokeObjectURL(url); }
  }

  async function send(text, opts = {}) {
    text = String(text || '').trim();
    if (!text) return;
    const assistant = opts.assistant || S.selected;
    const reqId = rid();
    const guess = opts.continueOf ? assistant : guessSpeaker(text, assistant);
    const tempUser = { id: 'tmp-u-' + reqId, role: 'user', content: text, created_at: new Date().toISOString(), meta: { to: guess } };
    const tempBot = { id: 'tmp-a-' + reqId, role: 'assistant', speaker: guess, status: 'streaming', content: '', created_at: new Date().toISOString(), meta: {} };
    const st = { reqId, msgId: tempBot.id, text: '', speaker: guess, threadId: S.thread?.id || 'new', ctrl: new AbortController(), local: [tempUser, tempBot] };
    S.streams.set(reqId, st);
    if (S.view !== 'chat') S.view = 'chat';
    S.messages.push(tempUser, tempBot);
    const pics = files.splice(0); draw(); scrollEnd(true);

    let images = [], attachments = [];
    try {
      for (const f of pics) {
        images.push(await readImage(f));
        const path = `${uid()}/team/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const up = await sb().storage.from('drawup-private').upload(path, await (await fetch(images[images.length - 1])).blob(), { contentType: 'image/jpeg', upsert: false });
        if (!up.error) attachments.push({ kind: 'image', name: f.name, path });
      }
    } catch (e) { toast(e.message, true); }

    const body = { message: text, request_id: reqId, assistant, thread_id: S.thread?.id || undefined, project_id: !S.thread ? (S.projectId || undefined) : undefined, images, attachments, continue_of: opts.continueOf || undefined };
    let tries = 0, gotMeta = false;
    for (;;) {
      try {
        const res = await fetch('/api/team/chat', { method: 'POST', signal: st.ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, body: JSON.stringify(body) });
        const type = res.headers.get('content-type') || '';
        if (!/ndjson/.test(type)) {
          const d = await res.json().catch(() => ({}));
          if (d.t === 'replay') { S.streams.delete(reqId); if (d.thread_id) await openThread(d.thread_id, true); return; }
          if (d.thread_id && (!S.thread || S.thread.id !== d.thread_id)) { await loadThreads(); S.thread = S.threads.find(t => t.id === d.thread_id) || S.thread; }
          throw Object.assign(new Error(d.error || 'The team could not answer (' + res.status + ').'), { status: res.status, data: d });
        }
        const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line) continue;
            let e; try { e = JSON.parse(line); } catch (_) { continue; }
            gotMeta = gotMeta || e.t === 'meta';
            onEvent(st, e);
          }
        }
        break;
      } catch (err) {
        if (err.name === 'AbortError') { st.stopped = true; break; }
        // A dropped connection before anything arrived is retried once with the same request id (never charged twice).
        if (!gotMeta && !err.status && tries++ < 1) { await sleep(800); continue; }
        const m = S.messages.find(x => x.id === st.msgId);
        if (m) { m.status = 'failed'; m.content = (err.message || 'Connection issue.') + (err.status === 402 ? '' : ' Try again.'); }
        if (err.status === 402) loadCredits();
        break;
      }
    }
    S.streams.delete(reqId);
    // After Stop, stop() saves the partial text and redraws; reloading here could race that save.
    if (!st.stopped && S.thread && st.threadId === S.thread.id) { await loadMessages().catch(() => {}); await loadJobs(); }
    loadCredits().then(() => { const c = S.host?.querySelector('#du-tm25-credits'); if (c) c.textContent = S.unlimited ? 'Unlimited credits' : S.credits + ' credits'; });
    draw(); schedulePoll();
  }

  let raf = 0;
  function onEvent(st, e) {
    if (e.t === 'meta') {
      const known = S.threads.find(t => t.id === e.thread_id);
      if (!known) { S.threads.unshift({ id: e.thread_id, title: e.thread_title, project_thread_id: e.project_id, updated_at: new Date().toISOString(), team: true }); }
      const onThis = !S.thread || S.thread.id === e.thread_id || st.threadId === 'new';
      if (!S.thread && onThis) { S.thread = S.threads.find(t => t.id === e.thread_id); history.replaceState(null, '', '#portal/ai-team?thread=' + e.thread_id); }
      st.threadId = e.thread_id;
      const u = S.messages.find(m => m.id === 'tmp-u-' + st.reqId), a = S.messages.find(m => m.id === st.msgId);
      if (u) u.id = e.user_message_id; if (a) { a.id = e.message_id; a.speaker = e.speaker; }
      st.local[0].id = e.user_message_id; st.local[1].id = e.message_id; st.local[1].speaker = e.speaker;
      st.msgId = e.message_id; st.speaker = e.speaker;
      if (e.named && e.speaker !== S.selected) { S.selected = e.speaker; store.set('du-tm25-assistant', e.speaker); }
      if (e.credits_remaining != null) S.credits = e.credits_remaining;
      if (e.unlimited) S.unlimited = true;
      draw(); scrollEnd(true);
    } else if (e.t === 'delta') {
      st.text += e.text;
      const a = S.messages.find(m => m.id === st.msgId); if (a) a.content = st.text;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        for (const s of S.streams.values()) {
          const el = S.host?.querySelector(`.du-tm25-msg[data-id="${s.msgId}"] .du-tm25-text`);
          if (el) el.innerHTML = md(s.text);
        }
        const bench = S.host?.querySelector('.du-tm25-bench'); if (bench) bench.innerHTML = benchHtml();
        scrollEnd(false);
      });
    } else if (e.t === 'status') {
      const bench = S.host?.querySelector('.du-tm25-bench'); if (bench) bench.innerHTML = benchHtml();
    } else if (e.t === 'job') {
      if (!S.jobs.some(j => j.id === e.job.id)) S.jobs.push(e.job);
      S.allJobs = [e.job, ...S.allJobs.filter(j => j.id !== e.job.id)];
    } else if (e.t === 'job_error') { toast(e.error, true); }
    else if (e.t === 'done' && e.message) {
      const i = S.messages.findIndex(m => m.id === e.message.id); if (i >= 0) S.messages[i] = e.message;
      if (S.prefs?.speak_replies) speak(e.message.content);
    } else if (e.t === 'error') {
      const a = S.messages.find(m => m.id === st.msgId); if (a) { a.status = 'failed'; a.content = e.error; }
    }
  }

  async function stop(msgId) {
    const st = [...S.streams.values()].find(s => s.msgId === msgId); if (!st) return;
    st.stopped = true; st.ctrl.abort();
    const m = S.messages.find(x => x.id === msgId); if (m) { m.status = 'stopped'; m.content = st.text; }
    S.streams.delete(st.reqId); draw();
    if (!String(msgId).startsWith('tmp-')) { try { await api('/api/team/chat', { method: 'PATCH', body: JSON.stringify({ message_id: msgId, content: st.text }) }); } catch (_) {} }
  }

  /* ------------------------------------------------------------------ background jobs */
  function schedulePoll() {
    clearTimeout(S.pollTimer);
    const active = S.jobs.some(j => j.status === 'running' || j.status === 'finishing');
    if (!active || !S.thread) return;
    let delay = 4000;
    const tick = async () => {
      if (!S.host?.isConnected || !S.thread) return;
      const before = S.jobs.map(j => j.id + j.status).join();
      await loadJobs();
      if (S.jobs.map(j => j.id + j.status).join() !== before) {
        await loadMessages();
        const done = S.jobs.filter(j => j.status === 'completed' && !S.seen[j.id]);
        done.forEach(j => toast(`${NAMES[j.speaker] || 'Team'}: ${j.title} is ready.`));
        if (!S.streams.size) draw(); else { const b = S.host.querySelector('.du-tm25-body'); if (b && S.view === 'chat') { b.innerHTML = chatHtml(); bindMsgs(S.host); } }
      } else S.host.querySelectorAll('.du-tm25-job.running small').forEach(el => { const j = S.jobs.find(x => x.id === el.closest('[data-job]').dataset.job); if (j) { const s = Math.round((Date.now() - new Date(j.created_at)) / 1000); el.textContent = s < 90 ? s + 's' : Math.round(s / 60) + ' min'; } });
      if (S.jobs.some(j => j.status === 'running' || j.status === 'finishing')) { delay = Math.min(12000, delay + 1500); S.pollTimer = setTimeout(tick, delay); }
    };
    S.pollTimer = setTimeout(tick, delay);
  }
  async function globalPoll() {
    clearTimeout(S.globalTimer);
    if (!S.host?.isConnected) return;
    try { const d = await api('/api/team/jobs?active=1'); const was = S.allJobs.map(j => j.id + j.status).join(); S.allJobs = d.jobs || []; if (was !== S.allJobs.map(j => j.id + j.status).join() && !S.streams.size) draw(); } catch (_) {}
    const busy = S.allJobs.some(j => j.status === 'running');
    S.globalTimer = setTimeout(globalPoll, document.hidden ? 60000 : busy ? 15000 : 45000);
  }
  async function jobAction(body) {
    try { const d = await api('/api/team/jobs', { method: 'POST', body: JSON.stringify(body) }); await loadJobs(); draw(); schedulePoll(); return d; }
    catch (e) { toast(e.message, true); return null; }
  }

  /* ------------------------------------------------------------------ Locker Room, memory, add to set / project */
  async function saveLocker(item) {
    const r = await sb().from('locker_items').insert({ owner_id: uid(), coach_thread_id: S.thread?.id || null, project_thread_id: item.project_thread_id === undefined ? (activeProjectId() || null) : item.project_thread_id, ...item }).select('id').single();
    if (r.error) { toast('Could not save: ' + r.error.message, true); return false; }
    toast(`Saved to the Locker Room as ${KINDS[item.kind] || 'an item'}.`); return true;
  }
  const msgById = id => S.messages.find(m => m.id === id);
  const pickedTexts = () => S.messages.filter(m => S.picked.has(m.id)).map(m => (m.role === 'user' ? 'Me: ' : NAMES[m.speaker || 'coach'] + ': ') + String(m.content || '').trim());

  async function drawingSets(projectId) {
    try { if (window.DrawUpDrawIt?.latest) { const l = await window.DrawUpDrawIt.latest({ projectId: projectId || undefined }); if (Array.isArray(l)) return l; } } catch (_) {}
    let q = sb().from('drawing_generations').select('id,title,created_at,project_thread_id').eq('owner_id', uid()).order('created_at', { ascending: false }).limit(12);
    if (projectId) q = q.eq('project_thread_id', projectId);
    const { data } = await q; return data || [];
  }
  async function addToSet(comments, opts = {}) {
    const modal = C().modal; if (!modal) return;
    const pid = activeProjectId();
    let sets = await drawingSets(pid);
    if (!sets.length && pid) sets = await drawingSets('');
    const m = modal(opts.title || 'Add to a drawing set', `<p class="du-muted">These ${comments.length} item${comments.length > 1 ? 's' : ''} go to Draw it up as comments on the set. Regenerate keeps what was right, applies the comments, saves the previous version and marks the redlines.</p>
      <ol class="du-tm25-list">${comments.map(c => `<li>${esc(c.length > 220 ? c.slice(0, 219) + '…' : c)}</li>`).join('')}</ol>
      ${sets.length ? `<label class="du-tm25-field">Drawing set<select id="du-tm25-set">${sets.map(s => `<option value="${s.id}">${esc(s.title)}${s.revision ? ' · rev ' + esc(s.revision) : ''} · ${esc(when(s.created_at))}</option>`).join('')}</select></label>
      <div class="du-tm25-proprow"><button type="button" class="du-btn primary" data-go="regen">Add + regenerate</button><button type="button" class="du-btn ghost" data-go="add">Add as comments only</button></div>`
      : `<p>There is no drawing set${pid ? ' for this project' : ''} yet. Start one in Draw it up from a picture, sketch or PDF, then add these.</p><div class="du-tm25-proprow"><button type="button" class="du-btn primary" data-go="new">Open Draw it up</button></div>`}`, 'AI DESIGN TEAM');
    m.querySelectorAll('[data-go]').forEach(b => b.onclick = async () => {
      const how = b.dataset.go, setId = m.querySelector('#du-tm25-set')?.value || '', set = sets.find(s => s.id === setId);
      m.remove();
      if (how === 'new') { window.DrawUpDrawIt?.openInCoach?.({ projectId: pid }); return; }
      if (how === 'regen' && S.thread) await jobAction({ action: 'track_drawing', thread_id: S.thread.id, request_id: rid(), set_id: setId, set_title: set?.title || '', comments, message_id: opts.messageId || undefined });
      if (window.DrawUpDrawIt?.open) window.DrawUpDrawIt.open({ setId, projectId: pid || set?.project_thread_id || undefined, comments, regenerate: how === 'regen' });
      else { try { await navigator.clipboard.writeText(comments.join('\n')); } catch (_) {} window.DrawUpDrawIt?.openInCoach?.({ setId, projectId: pid }); toast('Draw it up opened. The comments were copied, paste them into the set.'); }
    });
  }
  async function addToProject(texts, opts = {}) {
    const modal = C().modal; if (!modal) return;
    const pid = activeProjectId();
    const m = modal('Add to a project', `<p class="du-muted">Saved items join the project's memory, so Teammate, 6th Man and Coach all work from them.</p>
      <label class="du-tm25-field">Project<select id="du-tm25-p">${S.projects.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select></label>
      <label class="du-tm25-field">Save as<select id="du-tm25-k"><option value="todo" ${!opts.kind ? 'selected' : ''}>Project to-do (shows in Draw it up)</option>${['note', 'decision', 'idea', 'unfinished'].map(k => `<option value="${k}" ${k === opts.kind ? 'selected' : ''}>${KINDS[k]}</option>`).join('')}</select></label>
      ${S.projects.length ? '' : '<p>You have no projects yet. Create one under Projects first.</p>'}
      <div class="du-tm25-proprow"><button type="button" class="du-btn primary" id="du-tm25-pgo" ${S.projects.length ? '' : 'disabled'}>Add ${texts.length} item${texts.length > 1 ? 's' : ''}</button>${S.thread && !S.thread.project_thread_id ? '<label class="du-tm25-chk"><input type="checkbox" id="du-tm25-link" checked> Also link this conversation to the project</label>' : ''}</div>`, 'AI DESIGN TEAM');
    m.querySelector('#du-tm25-pgo').onclick = async () => {
      const project = m.querySelector('#du-tm25-p').value, kind = m.querySelector('#du-tm25-k').value, link = m.querySelector('#du-tm25-link')?.checked;
      const rows = texts.map(t => ({ owner_id: uid(), project_thread_id: project, coach_thread_id: S.thread?.id || null, message_id: opts.messageId && !String(opts.messageId).startsWith('tmp-') ? opts.messageId : null, kind, title: firstLine(t), body: t.slice(0, 20000), speaker: opts.speaker || null }));
      // A to-do goes to the project's to-do list (project page + Draw it up "Add to this set") and to its memory.
      const r = kind === 'todo'
        ? await sb().from('project_todos').insert(texts.map(t => ({ project_thread_id: project, owner_id: uid(), title: firstLine(t, 160), instruction: t.slice(0, 4000), kind: 'design' })))
        : await sb().from('locker_items').insert(rows);
      if (r.error) { toast('Could not add: ' + r.error.message, true); return; }
      if (kind === 'todo') await sb().from('locker_items').insert(rows.map(x => ({ ...x, kind: 'unfinished' })));
      if (link && S.thread) { const u = await sb().from('coach_threads').update({ project_thread_id: project }).eq('id', S.thread.id).eq('owner_id', uid()); if (!u.error) S.thread.project_thread_id = project; }
      m.remove(); S.picked.clear(); toast(`Added to ${projectName(project) || 'the project'}.`); draw();
    };
  }

  async function renderLocker() {
    const box = S.host.querySelector('#du-tm25-locker'); if (!box) return;
    const { data, error } = await sb().from('locker_items').select('*').eq('owner_id', uid()).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(300);
    if (error) { box.innerHTML = `<p class="du-tm25-warn">${esc(/locker_items/.test(error.message) ? 'The Locker Room needs the v25 SQL (v25-03).' : error.message)}</p>`; return; }
    S.locker = data || [];
    const f = S.lockerFilter, list = S.locker.filter(i => f === 'all' || i.kind === f || (f === 'project' && i.project_thread_id === activeProjectId()));
    box.innerHTML = `<div class="du-tm25-panelhead"><div><span class="du-kicker">THE LOCKER ROOM</span><h2>Saved ideas, decisions and plays</h2><p class="du-muted">Everything you save from the team lives here. Reopen anything and keep working.</p></div><button type="button" class="du-btn primary" data-lnew>＋ New note</button></div>
      <div class="du-tm25-filters">${[['all', 'All'], ['project', 'This project'], ...Object.entries(KINDS)].map(([k, l]) => `<button type="button" data-lf="${k}" class="${f === k ? 'on' : ''}">${esc(l)}</button>`).join('')}<input type="search" id="du-tm25-lsearch" placeholder="Search the Locker Room" aria-label="Search the Locker Room"></div>
      <div class="du-tm25-cards">${list.map(i => `<article class="du-tm25-card ${i.kind}" data-lid="${i.id}" data-text="${esc((i.title + ' ' + i.body).toLowerCase())}"><header><span class="du-tm25-badge">${esc(KINDS[i.kind] || i.kind)}</span>${i.pinned ? '<span class="du-tm25-badge ok">Pinned</span>' : ''}<small>${esc(projectName(i.project_thread_id) || 'No project')} · ${esc(when(i.created_at))}</small></header>
        <h3>${esc(i.title)}</h3><div class="du-tm25-text">${md(i.body.length > 900 ? i.body.slice(0, 900) + '…' : i.body)}</div>
        <div class="du-tm25-acts"><button type="button" data-lopen="${i.id}">Reopen</button><button type="button" data-ledit="${i.id}">Edit</button><button type="button" data-lpin="${i.id}">${i.pinned ? 'Unpin' : 'Pin'}</button><button type="button" data-lset="${i.id}">Add to set</button><button type="button" data-ldel="${i.id}">Delete</button></div></article>`).join('') || '<p class="du-muted">Nothing here yet. Use “Save idea”, “Bookmark” or “Approve & save decision” on any message.</p>'}</div>`;
    box.querySelectorAll('[data-lf]').forEach(b => b.onclick = () => { S.lockerFilter = b.dataset.lf; renderLocker(); });
    box.querySelector('#du-tm25-lsearch').oninput = e => { const q = e.target.value.toLowerCase(); box.querySelectorAll('[data-lid]').forEach(c => c.hidden = q && !c.dataset.text.includes(q)); };
    box.querySelector('[data-lnew]').onclick = () => editLocker(null);
    const item = id => S.locker.find(i => i.id === id);
    box.querySelectorAll('[data-lopen]').forEach(b => b.onclick = async () => {
      const i = item(b.dataset.lopen);
      if (i.coach_thread_id && S.threads.some(t => t.id === i.coach_thread_id)) { await openThread(i.coach_thread_id); if (i.message_id) setTimeout(() => { const el = S.host.querySelector(`[data-id="${i.message_id}"]`); el?.scrollIntoView({ block: 'center' }); el?.classList.add('flash'); }, 80); }
      else { S.thread = null; S.projectId = i.project_thread_id || ''; S.view = 'chat'; S.messages = []; draw(); const inp = S.host.querySelector('#du-tm25-input'); if (inp) { inp.value = `Let's pick up this ${KINDS[i.kind]?.toLowerCase() || 'idea'}: ${i.title}\n\n${i.body.slice(0, 1500)}`; inp.focus(); } }
    });
    box.querySelectorAll('[data-ledit]').forEach(b => b.onclick = () => editLocker(item(b.dataset.ledit)));
    box.querySelectorAll('[data-lpin]').forEach(b => b.onclick = async () => { const i = item(b.dataset.lpin); await sb().from('locker_items').update({ pinned: !i.pinned, updated_at: new Date().toISOString() }).eq('id', i.id); renderLocker(); });
    box.querySelectorAll('[data-lset]').forEach(b => b.onclick = () => { const i = item(b.dataset.lset); addToSet([i.title === firstLine(i.body) ? i.body : i.title + ': ' + i.body]); });
    box.querySelectorAll('[data-ldel]').forEach(b => b.onclick = async () => { if (!confirm('Delete this from the Locker Room?')) return; const r = await sb().from('locker_items').delete().eq('id', b.dataset.ldel); if (r.error) toast(r.error.message, true); renderLocker(); });
  }
  function editLocker(i) {
    const m = C().modal(i ? 'Edit saved item' : 'New Locker Room note', `<label class="du-tm25-field">Title<input id="du-tm25-lt" maxlength="200" value="${esc(i?.title || '')}"></label>
      <label class="du-tm25-field">Type<select id="du-tm25-lk">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${k === (i?.kind || 'note') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="du-tm25-field">Project<select id="du-tm25-lp"><option value="">No project</option>${S.projects.map(p => `<option value="${p.id}" ${p.id === (i ? i.project_thread_id : activeProjectId()) ? 'selected' : ''}>${esc(p.project_name)}</option>`).join('')}</select></label>
      <label class="du-tm25-field">Details<textarea id="du-tm25-lb" rows="8">${esc(i?.body || '')}</textarea></label><button type="button" class="du-btn primary" id="du-tm25-lsave">Save</button>`, 'THE LOCKER ROOM');
    m.querySelector('#du-tm25-lsave').onclick = async () => {
      const row = { title: m.querySelector('#du-tm25-lt').value.trim() || 'Note', kind: m.querySelector('#du-tm25-lk').value, project_thread_id: m.querySelector('#du-tm25-lp').value || null, body: m.querySelector('#du-tm25-lb').value, updated_at: new Date().toISOString() };
      const r = i ? await sb().from('locker_items').update(row).eq('id', i.id) : await sb().from('locker_items').insert({ owner_id: uid(), ...row });
      if (r.error) { toast(r.error.message, true); return; }
      m.remove(); renderLocker();
    };
  }

  async function renderMemory() {
    const box = S.host.querySelector('#du-tm25-memory'); if (!box) return;
    const pid = activeProjectId();
    const keys = [pid ? 'project:' + pid : '', S.thread ? 'thread:' + S.thread.id : ''].filter(Boolean);
    const [mem, items] = await Promise.all([
      keys.length ? sb().from('team_memory').select('*').eq('owner_id', uid()).in('scope_key', keys) : Promise.resolve({ data: [] }),
      pid ? sb().from('locker_items').select('id,kind,title,created_at').eq('owner_id', uid()).eq('project_thread_id', pid).in('kind', ['decision', 'rejected', 'finding', 'note', 'unfinished']).order('created_at', { ascending: false }).limit(60) : Promise.resolve({ data: [] }),
    ]);
    if (mem.error) { box.innerHTML = `<p class="du-tm25-warn">${esc(/team_memory/.test(mem.error.message) ? 'Project Memory needs the v25 SQL (v25-05).' : mem.error.message)}</p>`; return; }
    const row = (mem.data || [])[0];
    const group = k => (items.data || []).filter(i => i.kind === k);
    box.innerHTML = `<div class="du-tm25-panelhead"><div><span class="du-kicker">PROJECT MEMORY</span><h2>${esc(projectName(pid) || (S.thread ? 'This conversation' : 'Pick a project or conversation'))}</h2>
      <p class="du-muted">What the whole team remembers. The summary refreshes itself every dozen or so messages (free, it never uses your credits). Your notes always win over the summary.</p></div></div>
      ${keys.length ? `<section class="du-tm25-memsec"><h3>Team summary ${row?.refreshed_at ? `<small>refreshed ${esc(when(row.refreshed_at))}</small>` : ''}</h3>${row?.summary ? `<div class="du-tm25-text">${md(row.summary)}</div><button type="button" class="du-btn ghost" data-mclear="${row.id}">Clear summary</button>` : '<p class="du-muted">No summary yet. It appears after a few messages.</p>'}</section>
      <section class="du-tm25-memsec"><h3>Your corrections and notes</h3><textarea id="du-tm25-notes" rows="5" placeholder="e.g. Budget is $1.2M. Client wants the conference room next to reception. Ignore the earlier 30 ft span.">${esc(row?.user_notes || '')}</textarea><button type="button" class="du-btn primary" id="du-tm25-savenotes" ${row ? '' : 'disabled title="Available once the first summary is made"'}>Save notes</button></section>` : ''}
      ${pid ? `<section class="du-tm25-memsec"><h3>Decisions</h3>${listOf(group('decision'))}<h3>Rejected ideas</h3>${listOf(group('rejected'))}<h3>Coach findings</h3>${listOf(group('finding'))}<h3>Notes + unfinished work</h3>${listOf([...group('note'), ...group('unfinished')])}</section>` : ''}
      <section class="du-tm25-memsec"><h3>Who can see the project</h3><p class="du-muted">Memory is private to you and the people with access to this project. 6th Man and Arch Coach only read it while their standby awareness is on.</p>
      <label class="du-tm25-chk"><input type="checkbox" data-pref="sixth_man_aware" ${S.prefs.sixth_man_aware ? 'checked' : ''}> 6th Man follows the project while on the bench</label>
      <label class="du-tm25-chk"><input type="checkbox" data-pref="coach_aware" ${S.prefs.coach_aware ? 'checked' : ''}> Arch Coach keeps project awareness</label></section>`;
    function listOf(a) { return a.length ? '<ul class="du-tm25-memlist">' + a.map(i => `<li>${esc(i.title)} <small>${esc(when(i.created_at))}</small> <button type="button" data-mdel="${i.id}" aria-label="Delete">×</button></li>`).join('') + '</ul>' : '<p class="du-muted">None yet.</p>'; }
    box.querySelector('[data-mclear]')?.addEventListener('click', async e => { if (!confirm('Clear the team summary? It rebuilds from the conversation later.')) return; await sb().from('team_memory').update({ summary: '', updated_at: new Date().toISOString() }).eq('id', e.target.dataset.mclear); renderMemory(); });
    box.querySelector('#du-tm25-savenotes')?.addEventListener('click', async () => { const r = await sb().from('team_memory').update({ user_notes: box.querySelector('#du-tm25-notes').value.slice(0, 8000), updated_at: new Date().toISOString() }).eq('id', row.id); toast(r.error ? r.error.message : 'Notes saved. The team uses them from the next message.', !!r.error); });
    box.querySelectorAll('[data-mdel]').forEach(b => b.onclick = async () => { await sb().from('locker_items').delete().eq('id', b.dataset.mdel); renderMemory(); });
    box.querySelectorAll('[data-pref]').forEach(c => c.onchange = () => savePrefs({ [c.dataset.pref]: c.checked }));
  }

  async function renderJobs() {
    const box = S.host.querySelector('#du-tm25-jobs'); if (!box) return;
    try { const d = await api('/api/team/jobs?active=1'); S.allJobs = d.jobs || []; } catch (_) {}
    box.innerHTML = `<div class="du-tm25-panelhead"><div><span class="du-kicker">ACTIVE GENERATIONS</span><h2>Background tasks</h2><p class="du-muted">These keep running if you leave the page. Results attach to the question that started them.</p></div></div>
      ${S.allJobs.length ? S.allJobs.map(j => `<div class="du-tm25-jobrow">${jobHtml(j)}<button type="button" class="du-btn ghost" data-jthread="${j.coach_thread_id}">Open conversation</button></div>`).join('') : '<p class="du-muted">Nothing running. Ask Coach a code question, have 6th Man take the shot, or ask Teammate for a new layout option.</p>'}`;
    box.querySelectorAll('[data-jthread]').forEach(b => b.onclick = () => openThread(b.dataset.jthread));
    bindJobButtons(box);
    S.allJobs.filter(j => j.status === 'completed' || j.status === 'failed').forEach(j => S.seen[j.id] = 1); store.set('du-tm25-seen', S.seen);
  }

  async function openThread(id, force) {
    if (!S.threads.some(t => t.id === id)) await loadThreads();
    S.thread = S.threads.find(t => t.id === id) || null; S.view = 'chat'; S.picked.clear(); S.railOpen = false;
    history.replaceState(null, '', '#portal/ai-team' + (S.thread ? '?thread=' + id : ''));
    await Promise.all([loadMessages(), loadJobs()]); draw(); schedulePoll();
  }

  function speak(text) {
    try { const u = new SpeechSynthesisUtterance(String(text || '').replace(/[#*_`>|]/g, '').slice(0, 1500)); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (_) {}
  }
  let rec = null;
  function mic(btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    if (rec) { rec.stop(); return; }
    const input = S.host.querySelector('#du-tm25-input'), base = input.value ? input.value + ' ' : '';
    rec = new SR(); rec.interimResults = true; rec.lang = navigator.language || 'en-US';
    btn.classList.add('on'); btn.setAttribute('aria-label', 'Stop listening');
    let finalText = '';
    rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; } input.value = base + finalText + interim; };
    rec.onerror = e => toast(e.error === 'not-allowed' ? 'Allow the microphone to talk to the team.' : 'Voice stopped: ' + e.error, true);
    rec.onend = () => { rec = null; btn.classList.remove('on'); btn.setAttribute('aria-label', 'Talk instead of typing'); const t = input.value.trim(); if (finalText.trim() && t) { input.value = ''; send(t); } };
    rec.start();
  }

  function settings() {
    const m = C().modal('Team settings', `<label class="du-tm25-field">How Teammate and 6th Man talk to you<select id="du-tm25-style">${STYLES.map(([k, l]) => `<option value="${k}" ${S.prefs.style === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="du-tm25-chk"><input type="checkbox" id="du-tm25-concise" ${S.prefs.concise ? 'checked' : ''}> Short answers by default (ask for more any time)</label>
      <label class="du-tm25-chk"><input type="checkbox" id="du-tm25-six" ${S.prefs.sixth_man_aware ? 'checked' : ''}> 6th Man follows the project while on the bench</label>
      <label class="du-tm25-chk"><input type="checkbox" id="du-tm25-coach" ${S.prefs.coach_aware ? 'checked' : ''}> Arch Coach keeps project awareness</label>
      ${'speechSynthesis' in window ? `<label class="du-tm25-chk"><input type="checkbox" id="du-tm25-speak" ${S.prefs.speak_replies ? 'checked' : ''}> Read replies aloud</label>` : ''}
      <p class="du-muted">Standby awareness never runs AI in the background or uses credits. It only lets 6th Man and Coach read the project memory when you call them.</p>
      <button type="button" class="du-btn primary" id="du-tm25-psave">Save</button>`, 'AI DESIGN TEAM');
    m.querySelector('#du-tm25-psave').onclick = async () => { await savePrefs({ style: m.querySelector('#du-tm25-style').value, concise: m.querySelector('#du-tm25-concise').checked, sixth_man_aware: m.querySelector('#du-tm25-six').checked, coach_aware: m.querySelector('#du-tm25-coach').checked, speak_replies: !!m.querySelector('#du-tm25-speak')?.checked }); m.remove(); draw(); };
  }
  function bell() {
    const done = S.allJobs.filter(j => j.status === 'completed' || j.status === 'failed');
    const m = C().modal('Notifications', done.length ? `<div class="du-tm25-notes">${done.map(j => `<button type="button" data-n="${j.coach_thread_id}" class="${S.seen[j.id] ? '' : 'new'}"><b>${esc(NAMES[j.speaker] || 'Team')}: ${esc(j.title)}</b><span>${j.status === 'completed' ? 'Ready' : 'Did not finish'} · ${esc(when(j.completed_at || j.updated_at))}</span></button>`).join('')}</div>` : '<p class="du-muted">Finished background tasks show here.</p>', 'AI DESIGN TEAM');
    done.forEach(j => S.seen[j.id] = 1); store.set('du-tm25-seen', S.seen);
    m.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { m.remove(); openThread(b.dataset.n); });
  }

  /* ------------------------------------------------------------------ events */
  function bindJobButtons(root) {
    root.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { if (confirm('Cancel this task? Its credits come back.')) await jobAction({ action: 'cancel', job_id: b.dataset.cancel }); });
    root.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => jobAction({ action: 'retry', job_id: b.dataset.retry, request_id: rid() }));
    root.querySelectorAll('[data-revise]').forEach(b => b.onclick = () => jobAction({ action: 'revise', job_id: b.dataset.revise, request_id: rid() }));
    root.querySelectorAll('form[data-amend]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const c = f.c.value.trim(); if (!c) return; const d = await jobAction({ action: 'amend', job_id: f.dataset.amend, change: c }); if (d) toast('A running task can’t be changed mid-way, so this is queued for the next revision.'); });
  }
  function bindMsgs(w) {
    const on = (sel, fn) => w.querySelectorAll(sel).forEach(b => b.onclick = e => fn(b, e));
    on('[data-stop]', b => stop(b.dataset.stop));
    on('[data-continue]', b => { const m = msgById(b.dataset.continue); send('Keep going from where you stopped.', { continueOf: m.id, assistant: m.speaker || 'teammate' }); });
    on('[data-save]', b => { const m = msgById(b.dataset.save); saveLocker({ kind: b.dataset.kind, title: firstLine(m.content), body: m.content, message_id: m.id, speaker: m.speaker || null }); });
    on('[data-toset]', b => { const m = msgById(b.dataset.toset); addToSet([m.content], { messageId: m.id }); });
    on('[data-toproj]', b => { const m = msgById(b.dataset.toproj); addToProject([m.content], { messageId: m.id, speaker: m.speaker }); });
    on('[data-handoff]', b => { const m = msgById(b.dataset.msg), to = b.dataset.handoff; S.selected = to; store.set('du-tm25-assistant', to); draw(); const i = S.host.querySelector('#du-tm25-input'); i.value = `${NAMES[to]}, ${m.speaker === to ? '' : 'what do you think about ' + (m.role === 'user' ? 'this' : NAMES[m.speaker || 'coach'] + "'s last message") + '? '}`; i.focus(); });
    on('[data-speak]', b => speak(msgById(b.dataset.speak).content));
    on('[data-sugg]', b => {
      const m = msgById(b.dataset.msg), s = m.meta.suggestions[+b.dataset.sugg];
      if (s.kind === 'handoff') { S.selected = s.to; store.set('du-tm25-assistant', s.to); send(s.prompt || `${NAMES[s.to]}, take a look at this.`, { assistant: s.to }); }
      else if (s.kind === 'ask') send(s.prompt || s.label, { assistant: m.speaker || S.selected });
      else if (s.kind === 'save') saveLocker({ kind: s.save_kind || 'idea', title: firstLine(s.text || s.label), body: s.text || m.content, message_id: m.id, speaker: m.speaker });
      else if (s.kind === 'add_to_set') addToSet([s.text || m.content], { messageId: m.id });
      else if (s.kind === 'add_to_project') addToProject([s.text || m.content], { messageId: m.id, speaker: m.speaker });
    });
    on('[data-shot]', b => { const m = msgById(b.dataset.msg), p = m.meta.plays[+b.dataset.shot]; send(`6th Man, take the shot: Play ${+b.dataset.shot + 1} — ${p.title}`, { assistant: 'sixth_man' }); });
    on('[data-saveplay]', b => { const m = msgById(b.dataset.msg), p = m.meta.plays[+b.dataset.saveplay]; saveLocker({ kind: 'play', title: p.title, body: p.summary, message_id: m.id, speaker: 'sixth_man' }); });
    on('[data-decide]', b => { const m = msgById(b.dataset.decide); saveLocker({ kind: 'decision', title: firstLine(m.meta.decision, 180), body: m.meta.decision, message_id: m.id, speaker: m.speaker }); });
    on('[data-apply]', b => { const m = msgById(b.dataset.apply), p = m.meta.proposal; addToSet([...p.changes, ...(p.keep?.length ? ['Keep: ' + p.keep.join('; ')] : [])], { messageId: m.id, title: 'Apply: ' + p.title }); });
    on('[data-saveprop]', b => { const m = msgById(b.dataset.saveprop), p = m.meta.proposal; saveLocker({ kind: 'proposal', title: p.title, body: p.changes.map(c => '- ' + c).join('\n'), message_id: m.id, speaker: m.speaker }); });
    on('[data-reject]', b => { const m = msgById(b.dataset.reject), p = m.meta.proposal; saveLocker({ kind: 'rejected', title: p.title, body: p.changes.map(c => '- ' + c).join('\n'), message_id: m.id, speaker: m.speaker }); });
    w.querySelectorAll('[data-pick]').forEach(c => c.onchange = () => { c.checked ? S.picked.add(c.dataset.pick) : S.picked.delete(c.dataset.pick); const body = w.querySelector('.du-tm25-body'); const keep = w.querySelector('#du-tm25-msgs')?.scrollTop; body.innerHTML = chatHtml(); bindMsgs(w); const box = w.querySelector('#du-tm25-msgs'); if (box) box.scrollTop = keep; });
    on('[data-act="pick-set"]', () => addToSet(pickedTexts()));
    on('[data-act="pick-proj"]', () => addToProject(pickedTexts()));
    on('[data-act="pick-locker"]', async () => { const ms = S.messages.filter(m => S.picked.has(m.id)); const r = await sb().from('locker_items').insert(ms.map(m => ({ owner_id: uid(), kind: 'idea', title: firstLine(m.content), body: m.content, message_id: m.id, coach_thread_id: S.thread?.id || null, project_thread_id: activeProjectId() || null, speaker: m.speaker || null }))); toast(r.error ? r.error.message : `${ms.length} saved to the Locker Room.`, !!r.error); S.picked.clear(); draw(); });
    on('[data-act="pick-clear"]', () => { S.picked.clear(); draw(); });
    on('[data-starter]', b => send(b.dataset.starter, { assistant: b.dataset.as }));
    bindJobButtons(w);
  }
  function bind(w) {
    const on = (sel, fn) => w.querySelectorAll(sel).forEach(b => b.onclick = e => fn(b, e));
    on('[data-view]', b => { S.view = b.dataset.view; S.railOpen = false; draw(); });
    on('[data-thread]', b => openThread(b.dataset.thread));
    on('[data-act="new"]', () => { S.thread = null; S.messages = []; S.jobs = []; S.view = 'chat'; S.railOpen = false; history.replaceState(null, '', '#portal/ai-team'); draw(); w.querySelector('#du-tm25-input')?.focus(); });
    on('[data-act="rail"]', () => { S.railOpen = !S.railOpen; w.querySelector('.du-tm25').classList.toggle('rail-open', S.railOpen); });
    on('[data-act="settings"]', settings);
    on('[data-act="bell"]', bell);
    on('[data-act="stopall"]', () => [...S.streams.values()].forEach(s => stop(s.msgId)));
    on('[data-act="mic"]', b => mic(b));
    on('[data-pickas]', b => { S.selected = b.dataset.pickas; store.set('du-tm25-assistant', S.selected); w.querySelectorAll('[data-pickas]').forEach(x => x.setAttribute('aria-checked', String(x === b))); const i = w.querySelector('#du-tm25-input'); i.placeholder = `Talk to ${NAMES[S.selected]}…`; const pill = w.querySelector('.du-tm25-headstats .du-tm25-pill'); if (pill) pill.textContent = ICON[S.selected] + ' ' + NAMES[S.selected]; const hint = w.querySelector('.du-tm25-hint span'); const c = S.costs || {}; if (hint) hint.textContent = `${NAMES[S.selected]} · ${S.selected === 'coach' ? `${c.coach_basic ?? 3} credits (${c.coach_code ?? 8} for code / ADA questions)` : `${c.chat ?? 1} credit per message`}`; i.focus(); });
    const sel = w.querySelector('#du-tm25-project');
    if (sel) sel.onchange = async () => {
      if (!S.thread) { S.projectId = sel.value; return; }
      if (!confirm(sel.value ? `Link this conversation to ${projectName(sel.value)}? The team will use that project's memory.` : 'Unlink this conversation from its project?')) { sel.value = S.thread.project_thread_id || ''; return; }
      const r = await sb().from('coach_threads').update({ project_thread_id: sel.value || null }).eq('id', S.thread.id).eq('owner_id', uid());
      if (r.error) { toast(r.error.message, true); sel.value = S.thread.project_thread_id || ''; return; }
      S.thread.project_thread_id = sel.value || null; toast('Project updated.');
    };
    const form = w.querySelector('#du-tm25-form');
    if (form) {
      const input = form.querySelector('#du-tm25-input');
      form.onsubmit = e => { e.preventDefault(); const t = input.value; input.value = ''; send(t); };
      input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
      const fi = form.querySelector('#du-tm25-file');
      fi.onchange = () => { files = [...files, ...fi.files].filter(f => /^image\//.test(f.type)).slice(0, 3); fi.value = ''; const box = form.querySelector('#du-tm25-files'); box.innerHTML = files.map((f, i) => `<span>🖼 ${esc(f.name)} <button type="button" data-rmf="${i}" aria-label="Remove">×</button></span>`).join(''); box.querySelectorAll('[data-rmf]').forEach(b => b.onclick = () => { files.splice(+b.dataset.rmf, 1); fi.onchange(); }); };
    }
    bindMsgs(w);
  }

  /* ------------------------------------------------------------------ project page card + public API */
  async function projectCard(host, projectId) {
    if (!host || !projectId) return;
    const [{ data: threads }, { data: items }] = await Promise.all([
      sb().from('coach_threads').select('id,title,updated_at').eq('owner_id', uid()).eq('project_thread_id', projectId).order('updated_at', { ascending: false }).limit(5),
      sb().from('locker_items').select('id,kind,title').eq('owner_id', uid()).eq('project_thread_id', projectId).order('created_at', { ascending: false }).limit(6).then(x => x, () => ({ data: [] })),
    ]);
    host.innerHTML = `<div class="du-section-title"><span class="du-kicker">AI DESIGN TEAM</span><button class="du-btn primary" type="button" data-tm-new>Talk to the team</button></div>
      ${(threads || []).map(t => `<div class="du-row"><div><b>${esc(t.title)}</b><span>${esc(when(t.updated_at))}</span></div><button class="du-btn ghost" type="button" data-tm-open="${t.id}">Open →</button></div>`).join('') || '<p>No team conversations for this project yet.</p>'}
      ${(items || []).length ? `<p class="du-kicker" style="margin-top:12px">SAVED TO THIS PROJECT</p><ul class="du-tm25-memlist">${items.map(i => `<li><span class="du-tm25-badge">${esc(KINDS[i.kind] || i.kind)}</span> ${esc(i.title)}</li>`).join('')}</ul>` : ''}`;
    host.querySelector('[data-tm-new]').onclick = () => open({ projectId, fresh: true });
    host.querySelectorAll('[data-tm-open]').forEach(b => b.onclick = () => open({ threadId: b.dataset.tmOpen }));
  }
  let pendingOpen = null;
  function open(opts = {}) {
    pendingOpen = opts;
    history.replaceState(null, '', '#portal/ai-team' + (opts.threadId ? '?thread=' + opts.threadId : ''));
    P()?.openPortalTab?.('ai-team');
  }
  window.DrawUpTeam = { open, projectCard, ask: (text, assistant) => open({ ask: text, assistant, fresh: true }) };

  (async () => {
    for (let i = 0; i < 200 && !P()?.registerTab; i++) await sleep(100);
    P()?.registerTab?.('ai-team', w => { const o = pendingOpen || {}; pendingOpen = null; return render(w, o); });
  })();
})();
