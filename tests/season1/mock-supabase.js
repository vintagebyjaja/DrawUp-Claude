/* Test-only stand-in for supabase-js: an in-memory database seeded with sample rows, so the portal can be
   rendered and screenshotted without a real Supabase. Never shipped. */
(function () {
  const UID = '11111111-1111-4111-8111-111111111111';
  const now = Date.now();
  const ago = h => new Date(now - h * 3600e3).toISOString();
  const user = { id: UID, email: 'jabari@example.com', user_metadata: { display_name: 'Jabari' }, is_anonymous: false };
  const P1 = 'aaaaaaaa-0000-4000-8000-000000000001', P2 = 'aaaaaaaa-0000-4000-8000-000000000002', P3 = 'aaaaaaaa-0000-4000-8000-000000000003', P4 = 'aaaaaaaa-0000-4000-8000-000000000004';
  const MOCK = window.__DU_MOCK || {};
  const DB = {
    profiles: [{ id: UID, display_name: 'Jabari', username: 'jabari', title: 'Project Architect', primary_affiliation_type: 'firm', primary_affiliation_name: 'KEi Architects', current_location: 'Richmond, VA', disciplines: ['Architecture', 'Interiors'], onboarding_interests: ['Design', 'Detailing'], onboarding_completed: true, profile_established: true, avatar_url: MOCK.avatar || null, credentials: [{ name: 'NCARB AXP', issuer: 'NCARB' }], created_at: ago(900) }],
    arch_coach_credit_accounts: [{ user_id: UID, plan_code: 'pro', unlimited_access: false, monthly_credits_remaining: 420, purchased_credits_remaining: 80 }],
    project_threads: [
      { id: P1, owner_id: UID, project_name: 'Henrico CASA Playhouse', project_type: 'Community / Arts', location: 'Henrico, VA', project_phase: 'Design Development', description: 'A 22,000 sf community playhouse with a flexible black box theater.', status: 'active', progress: MOCK.cover1 ? { cover: MOCK.cover1 } : {}, created_at: ago(400), updated_at: ago(2) },
      { id: P2, owner_id: UID, project_name: 'Hampton University Tech & AI Center', project_type: 'Higher Education', location: 'Hampton, VA', project_phase: 'Schematic Design', description: 'Teaching labs, maker space and a two-story commons.', status: 'active', progress: {}, created_at: ago(500), updated_at: ago(26) },
      { id: P3, owner_id: UID, project_name: 'KEi Office Renovation', project_type: 'Workplace', location: 'Richmond, VA', project_phase: 'Construction Documents', description: 'Interior renovation of a 9,000 sf studio.', status: 'active', progress: {}, created_at: ago(700), updated_at: ago(74) },
      { id: P4, owner_id: UID, starter_key: 'athletic-storage-v1', project_name: 'DrawUp Athletic Storage Bldg Example', project_type: 'Learning project', location: 'DrawUp Learning Project', project_phase: 'Learning', status: 'active', progress: { step: 1 }, created_at: ago(900), updated_at: ago(300) }
    ],
    coach_threads: [
      { id: 'c1', owner_id: UID, title: 'Lobby options for CASA', project_thread_id: P1, created_at: ago(5), updated_at: ago(2) },
      { id: 'c2', owner_id: UID, title: 'Corridor width at labs', project_thread_id: P2, created_at: ago(30), updated_at: ago(28) }
    ],
    coach_messages: [],
    drawing_generations: [{ id: 'd1', owner_id: UID, project_thread_id: P1, title: 'CASA Playhouse DD set', model: {}, source_paths: MOCK.src1 ? [MOCK.src1] : [], issue_status: 'Preliminary', revision: 2, created_at: ago(5), updated_at: ago(5) }],
    swap_generations: MOCK.swap ? [{ id: 's1', owner_id: UID, project_thread_id: P2, source_path: 'x', result_path: MOCK.swap, status: 'complete', prompt: 'Warm oak and terrazzo', created_at: ago(26), completed_at: ago(26) }] : [],
    check_reviews: [{ id: 'k1', owner_id: UID, project_thread_id: P1, title: 'CASA DD code review', status: 'complete', created_at: ago(24), updated_at: ago(24) }],
    details: [{ id: 'dt1', owner_id: UID, code: 'AI-3D2C5', title: 'Parapet at roof edge', source: 'drawup_ai', created_at: ago(25) }],
    team_jobs: [], locker_items: [], team_memory: [], team_preferences: [], drawup_notifications: [], saved_items: [], career_timeline: [], profile_education: [],
    playbook_progress: [], playbook_awards: [], arch_coach_profiles: [{ user_id: UID, mode: 'custom', appearance: { gender: 'male', skin: 2, face: 0, hair: 4, hairColor: 0, outfit: 'drawup_hoodie', holo: 'classic', glasses: true }, coach_name: 'Coach J' }], arch_coach_xp_events: [], arch_coach_legends: [],
    project_sets: [], project_set_sheets: [], project_todos: [], firms: [], firm_members: [], connections: []
  };
  Object.entries(MOCK.extra || {}).forEach(([t, rows]) => { DB[t] = (DB[t] || []).concat(rows); }); Object.assign(DB.arch_coach_profiles[0], MOCK.profile || {});
  window.__duMockDB = DB;
  const log = window.__duMockLog = [];
  function match(row, f) {
    const v = row[f.col];
    switch (f.op) {
      case 'eq': return String(v) === String(f.val);
      case 'neq': return String(v) !== String(f.val);
      case 'in': return f.val.map(String).includes(String(v));
      case 'is': return f.val === null ? v == null : v === f.val;
      case 'gte': return v >= f.val; case 'lte': return v <= f.val; case 'gt': return v > f.val; case 'lt': return v < f.val;
      case 'ilike': return new RegExp('^' + String(f.val).replace(/%/g, '.*') + '$', 'i').test(String(v || ''));
      case 'not': return true;
      default: return true;
    }
  }
  class Q {
    constructor(t) { this.t = t; this.f = []; this.mode = 'select'; this.ord = null; this.lim = null; this.one = null; this.head = false; this.cnt = false; }
    select(_c, o) { if (this.mode === 'select') this.mode = 'select'; this.sel = true; if (o && o.head) this.head = true; if (o && o.count) this.cnt = true; return this; }
    insert(v) { this.mode = 'insert'; this.val = v; return this; }
    upsert(v) { this.mode = 'upsert'; this.val = v; return this; }
    update(v) { this.mode = 'update'; this.val = v; return this; }
    delete() { this.mode = 'delete'; return this; }
    eq(c, v) { this.f.push({ op: 'eq', col: c, val: v }); return this; }
    neq(c, v) { this.f.push({ op: 'neq', col: c, val: v }); return this; }
    in(c, v) { this.f.push({ op: 'in', col: c, val: v || [] }); return this; }
    is(c, v) { this.f.push({ op: 'is', col: c, val: v }); return this; }
    gte(c, v) { this.f.push({ op: 'gte', col: c, val: v }); return this; }
    lte(c, v) { this.f.push({ op: 'lte', col: c, val: v }); return this; }
    gt(c, v) { this.f.push({ op: 'gt', col: c, val: v }); return this; }
    lt(c, v) { this.f.push({ op: 'lt', col: c, val: v }); return this; }
    ilike(c, v) { this.f.push({ op: 'ilike', col: c, val: v }); return this; }
    like(c, v) { return this.ilike(c, v); }
    not() { return this; } or() { return this; } filter() { return this; } match(o) { Object.keys(o).forEach(k => this.eq(k, o[k])); return this; }
    contains() { return this; } overlaps() { return this; } textSearch() { return this; } returns() { return this; } abortSignal() { return this; }
    order(c, o) { this.ord = { c, asc: !o || o.ascending !== false }; return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.lim = b - a + 1; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    single() { this.one = 'single'; return this; }
    run() {
      const tbl = DB[this.t] || (DB[this.t] = []);
      log.push(this.mode + ' ' + this.t);
      if (this.mode === 'insert' || this.mode === 'upsert') {
        const rows = (Array.isArray(this.val) ? this.val : [this.val]).map(r => Object.assign({ id: 'm' + Math.random().toString(16).slice(2), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, r));
        rows.forEach(r => { const i = tbl.findIndex(x => x.id === r.id); if (i >= 0) Object.assign(tbl[i], r); else tbl.push(r); });
        return this.fin(rows);
      }
      let rows = tbl.filter(r => this.f.every(f => match(r, f)));
      if (this.mode === 'update') { rows.forEach(r => Object.assign(r, this.val)); return this.fin(rows); }
      if (this.mode === 'delete') { rows.forEach(r => tbl.splice(tbl.indexOf(r), 1)); return this.fin(rows); }
      if (this.ord) { const { c, asc } = this.ord; rows = rows.slice().sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
      const count = rows.length;
      if (this.lim != null) rows = rows.slice(0, this.lim);
      if (this.head) return { data: null, error: null, count };
      return this.fin(rows, count);
    }
    fin(rows, count) {
      if (this.one) { if (!rows.length && this.one === 'single') return { data: null, error: { message: 'No rows', code: 'PGRST116' } }; return { data: rows[0] || null, error: null, count }; }
      return { data: (this.mode === 'select' || this.sel) ? rows : null, error: null, count };
    }
    then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  }
  const RPC = { is_drawup_admin: !!MOCK.admin, drawup_my_firms: [], detail_review_summary: [], connect_my_chats: [], drawup_search: { firms: [], projects: [] }, vendor_slot_board: [], vendor_recommendations: [] };
  const listeners = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: MOCK.signedOut ? null : { user, access_token: 'mock-token' } }, error: null }),
      getUser: async () => ({ data: { user: MOCK.signedOut ? null : user }, error: null }),
      onAuthStateChange: cb => { listeners.push(cb); setTimeout(() => cb('INITIAL_SESSION', MOCK.signedOut ? null : { user, access_token: 'mock-token' }), 0); return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: async () => ({ error: null }), signInWithPassword: async () => ({ data: { user }, error: null }), signUp: async () => ({ data: { user }, error: null }), signInAnonymously: async () => ({ data: {}, error: null }),
      refreshSession: async () => ({ data: { session: { user } }, error: null })
    },
    from: t => new Q(t),
    rpc: async n => ({ data: n in RPC ? RPC[n] : null, error: null }),
    storage: { from: b => ({
      createSignedUrl: async p => ({ data: { signedUrl: /^(https?:|\/)/.test(p) ? p : '/__mock/' + p }, error: null }),
      createSignedUrls: async ps => ({ data: ps.map(p => ({ path: p, signedUrl: /^(https?:|\/)/.test(p) ? p : '/__mock/' + p })), error: null }),
      getPublicUrl: p => ({ data: { publicUrl: '/__mock/' + p } }),
      upload: async p => ({ data: { path: p }, error: null }), download: async () => ({ data: new Blob([]), error: null }), remove: async () => ({ data: [], error: null }), list: async () => ({ data: [], error: null })
    }) },
    channel: () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {}, send: () => {} }; return ch; },
    removeChannel: () => {}, functions: { invoke: async () => ({ data: null, error: null }) }
  };
  window.supabase = { createClient: () => client };
})();
