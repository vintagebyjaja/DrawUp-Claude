-- DrawUp V21.2 — durable Arch Coach background answers + in-app notifications.
-- Safe to run after the existing coach_threads / coach_messages schema.

alter table public.coach_messages add column if not exists answer_status text;
alter table public.coach_messages add column if not exists quick_content text;
alter table public.coach_messages add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.coach_messages add column if not exists arch_coach_job_id uuid;

create table if not exists public.arch_coach_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid null references public.coach_threads(id) on delete cascade,
  assistant_message_id uuid null references public.coach_messages(id) on delete set null,
  response_id text not null unique,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  quick_answer text,
  full_answer text,
  sources jsonb not null default '[]'::jsonb,
  research boolean not null default false,
  action text not null default 'basic_question',
  access jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists arch_coach_jobs_owner_status_idx on public.arch_coach_jobs(owner_id,status,created_at desc);

create table if not exists public.drawup_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text,
  ref_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists drawup_notifications_user_idx on public.drawup_notifications(user_id,read_at,created_at desc);

alter table public.arch_coach_jobs enable row level security;
alter table public.drawup_notifications enable row level security;
revoke all on public.arch_coach_jobs from anon, authenticated;
grant select on public.arch_coach_jobs to authenticated;
grant select, update on public.drawup_notifications to authenticated;

drop policy if exists "arch coach jobs own read" on public.arch_coach_jobs;
create policy "arch coach jobs own read" on public.arch_coach_jobs for select to authenticated using (owner_id = auth.uid());
drop policy if exists "drawup notifications own read" on public.drawup_notifications;
create policy "drawup notifications own read" on public.drawup_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "drawup notifications own mark read" on public.drawup_notifications;
create policy "drawup notifications own mark read" on public.drawup_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
