-- DrawUp V9: Arch Coach free-question allowance
-- Enforce this in the server/API path before invoking the model; client counters are display-only.
create table if not exists public.arch_coach_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_questions_used integer not null default 0 check (free_questions_used between 0 and 10),
  updated_at timestamptz not null default now()
);

alter table public.arch_coach_usage enable row level security;
create policy "users read own arch coach usage" on public.arch_coach_usage
  for select using (auth.uid() = user_id);

-- Writes should be performed by a trusted server function/service role so users cannot reset usage.
comment on table public.arch_coach_usage is 'Tracks the first 10 free Arch Coach questions per authenticated account. Paid entitlement should bypass this cap.';
