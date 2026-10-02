-- DrawUp V9: Arch Coach credit plans and top-ups
-- Standard Arch Coach text question = 4 credits.
-- IMPORTANT: deduct credits in a trusted server/API function, never directly from browser code.

create table if not exists public.arch_coach_credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'explore' check (plan_code in ('explore','arch_coach','student','emerging','firm_free','firm_showcase','firm_pro')),
  monthly_credit_allowance integer not null default 0 check (monthly_credit_allowance >= 0),
  monthly_credits_remaining integer not null default 0 check (monthly_credits_remaining >= 0),
  purchased_credits_remaining integer not null default 0 check (purchased_credits_remaining >= 0),
  period_started_at timestamptz not null default now(),
  period_renews_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.arch_coach_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.arch_coach_credit_accounts enable row level security;
alter table public.arch_coach_credit_ledger enable row level security;

create policy "users read own credit account" on public.arch_coach_credit_accounts
  for select using (auth.uid() = user_id);
create policy "users read own credit ledger" on public.arch_coach_credit_ledger
  for select using (auth.uid() = user_id);

-- Server-side plan allowances used when a subscription starts/renews:
-- explore: 10 free questions tracked by arch_coach_usage (no card required), no monthly paid credits
-- arch_coach $8.20/mo: 100 credits (25 standard questions)
-- student $10/mo: 500 credits (125 standard questions)
-- emerging $19/mo: 1,200 credits (300 standard questions)
-- firm_showcase $49/mo: 3,000 shared credits (team pool should be moved to firm billing entity when implemented)
-- firm_pro $99/mo: 7,500 shared credits (team pool should be moved to firm billing entity when implemented)
-- Purchased top-up credits are stored separately from monthly credits so billing can define rollover/expiry independently.

comment on table public.arch_coach_credit_accounts is 'Arch Coach monthly and purchased credit balances. Standard text question costs 4 credits; heavier AI actions may cost more and should disclose cost before execution.';
comment on table public.arch_coach_credit_ledger is 'Immutable-style audit ledger for grants, renewals, purchases, and server-side Arch Coach credit deductions.';
