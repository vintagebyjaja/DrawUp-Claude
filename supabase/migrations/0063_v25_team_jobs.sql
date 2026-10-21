-- DrawUp v25-04: AI Design Team background jobs (Coach verification, 6th Man "take the shot", layout options,
-- drawing sets started from the chat). The AI work runs as a stored background response, so it keeps going when
-- the member leaves the page; the row records status, cost and the result message. Written by the server
-- (service role); the owner reads their own. The idempotency key stops a double click from starting (or charging)
-- the same job twice. Additive and safe to run twice.
create table if not exists public.team_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  coach_thread_id uuid references public.coach_threads(id) on delete cascade,
  project_thread_id uuid references public.project_threads(id) on delete set null,
  request_message_id uuid references public.coach_messages(id) on delete set null,
  result_message_id uuid references public.coach_messages(id) on delete set null,
  kind text not null,
  speaker text not null default 'teammate',
  title text not null default 'Background task',
  status text not null default 'running',
  response_id text,
  input jsonb not null default '{}'::jsonb,
  queued_changes jsonb not null default '[]'::jsonb,
  action text,
  access jsonb not null default '{}'::jsonb,
  credits integer not null default 0,
  idempotency_key text not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint team_jobs_kind_check check (kind in ('coach_verify','sixth_man_shot','layout_option','drawing_set')),
  constraint team_jobs_status_check check (status in ('running','finishing','completed','failed','canceled')),
  unique (owner_id, idempotency_key)
);
create index if not exists team_jobs_owner_idx on public.team_jobs (owner_id, status, created_at desc);
create index if not exists team_jobs_thread_idx on public.team_jobs (coach_thread_id, created_at);

alter table public.team_jobs enable row level security;
revoke all on public.team_jobs from anon, authenticated;
grant select on public.team_jobs to authenticated;
drop policy if exists "team jobs own read" on public.team_jobs;
create policy "team jobs own read" on public.team_jobs for select to authenticated using (owner_id = auth.uid());

select 'DONE v25-04 team jobs' as status;
