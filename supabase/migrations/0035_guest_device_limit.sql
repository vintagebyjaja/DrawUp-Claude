-- DrawUp V21: guest Arch Coach questions are limited per device and per network, not only per
-- anonymous session, so clearing the browser or opening a private window does not reset the 10 free
-- questions. Keys are one-way hashes made by the DrawUp server (device id, browser fingerprint,
-- network address); no raw address or fingerprint is stored. Additive and safe to re-run.

create table if not exists public.arch_coach_guest_quota (
  key text primary key,
  used integer not null default 0,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arch_coach_guest_quota_used_check check (used >= 0)
);

alter table public.arch_coach_guest_quota enable row level security;
revoke all on public.arch_coach_guest_quota from anon, authenticated;

-- Takes one guest question for every key at once, or none if any key is already at the limit.
-- Returns the questions left after this one, or -1 when the limit is reached.
create or replace function public.reserve_guest_quota(p_keys text[], p_limit integer default 10)
returns integer
language sql security definer set search_path = public as $$
  with k as (
    select distinct x as key from unnest(p_keys) x where length(coalesce(x, 'x')) > 8
  ), cur as (
    select coalesce(max(q.used), 0) as used from arch_coach_guest_quota q where q.key in (select key from k)
  ), up as (
    insert into arch_coach_guest_quota as q (key, used)
    select key, 1 from k where (select used from cur) < p_limit
    on conflict (key) do update set used = q.used + 1, updated_at = now()
    returning q.used
  )
  select case when count(*) = 0 then -1 else greatest(p_limit - max(used), 0) end from up
$$;

-- Gives one question back to every key (when the answer failed). Never goes below zero.
create or replace function public.refund_guest_quota(p_keys text[])
returns integer
language sql security definer set search_path = public as $$
  with upd as (
    update arch_coach_guest_quota q set used = greatest(q.used - 1, 0), updated_at = now()
    where q.key = any(p_keys) returning q.used
  ) select count(*)::integer from upd
$$;

-- Questions left for these keys, without taking one.
create or replace function public.guest_quota_left(p_keys text[], p_limit integer default 10)
returns integer
language sql stable security definer set search_path = public as $$
  select greatest(p_limit - coalesce(max(used), 0), 0) from arch_coach_guest_quota where key = any(p_keys)
$$;

revoke all on function public.reserve_guest_quota(text[], integer) from public, anon, authenticated;
revoke all on function public.refund_guest_quota(text[]) from public, anon, authenticated;
revoke all on function public.guest_quota_left(text[], integer) from public, anon, authenticated;
grant execute on function public.reserve_guest_quota(text[], integer) to service_role;
grant execute on function public.refund_guest_quota(text[]) to service_role;
grant execute on function public.guest_quota_left(text[], integer) to service_role;

select 'DONE 0035 guest device limit' as status;
-- END
