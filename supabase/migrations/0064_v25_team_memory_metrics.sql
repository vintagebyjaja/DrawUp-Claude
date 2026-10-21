-- DrawUp v25-05: AI Design Team memory + speed tracking.
-- team_memory: a short summary of a project (or a thread with no project) that the server refreshes after every
--   dozen or so new messages, so Coach and 6th Man already know the history without rereading everything.
--   The member can read it, correct it (user_notes), or clear it. One row per member + project / thread.
-- team_metrics: time to first word, total time, model and credits for each AI Design Team reply. Server writes;
--   only DrawUp HQ reads. Additive and safe to run twice.
create table if not exists public.team_memory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope_key text not null,
  project_thread_id uuid references public.project_threads(id) on delete cascade,
  coach_thread_id uuid references public.coach_threads(id) on delete cascade,
  summary text not null default '',
  user_notes text not null default '',
  message_count integer not null default 0,
  refreshed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, scope_key),
  constraint team_memory_notes_len check (char_length(user_notes) <= 8000)
);
alter table public.team_memory enable row level security;
revoke all on public.team_memory from anon, authenticated;
grant select, delete on public.team_memory to authenticated;
grant update (summary, user_notes, updated_at) on public.team_memory to authenticated;
drop policy if exists "team memory own read" on public.team_memory;
create policy "team memory own read" on public.team_memory for select to authenticated using (owner_id = auth.uid());
drop policy if exists "team memory own update" on public.team_memory;
create policy "team memory own update" on public.team_memory for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "team memory own delete" on public.team_memory;
create policy "team memory own delete" on public.team_memory for delete to authenticated using (owner_id = auth.uid());

create table if not exists public.team_metrics (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  speaker text,
  kind text not null default 'chat',
  model text,
  first_token_ms integer,
  total_ms integer,
  chars integer,
  credits integer,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists team_metrics_created_idx on public.team_metrics (created_at desc);
alter table public.team_metrics enable row level security;
revoke all on public.team_metrics from anon, authenticated;
grant select on public.team_metrics to authenticated;
drop policy if exists "team metrics hq read" on public.team_metrics;
create policy "team metrics hq read" on public.team_metrics for select to authenticated using (public.is_drawup_admin());

select 'DONE v25-05 team memory + metrics' as status;
