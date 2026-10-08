-- DrawUp V22 migration 0044: two DrawUp accounts per person (one personal email plus one school,
-- firm or business email). Same content as the six parts in drawup/v22/sql-parts/accounts, in order.
-- Additive, idempotent, never drops or wipes data. Safe to run twice.

-- DrawUp V22 accounts (0044 part 1 of 6): two DrawUp accounts per person.
-- A person may hold one personal email account plus one school, firm or business email account.
-- The DrawUp server links each account to one-way hashed keys of the device it is used on
-- (device id kept in browser storage and a cookie, browser fingerprint, network address).
-- No raw device id, fingerprint or address is stored. Additive and safe to run twice.

-- When the limit was switched on. Accounts created before this moment are grandfathered.
create table if not exists public.drawup_account_limit_meta (
  id integer primary key default 1,
  grandfather_cutoff timestamptz not null default now(),
  constraint drawup_account_limit_meta_one_row check (id = 1)
);

-- One row per account that has been checked against the two account rule.
-- status: grandfathered (existed before the limit), ok, blocked, hq (DrawUp HQ, exempt).
create table if not exists public.drawup_account_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_kind text not null,
  status text not null,
  reason text,
  linked_at timestamptz,
  checked_at timestamptz not null default now(),
  constraint drawup_account_links_kind_check check (email_kind in ('personal', 'school', 'work', 'invalid', 'hq')),
  constraint drawup_account_links_status_check check (status in ('grandfathered', 'ok', 'blocked', 'hq'))
);

-- Hashed keys seen for each account. d: device id, f: browser fingerprint, n: network.
create table if not exists public.drawup_account_keys (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, key),
  constraint drawup_account_keys_key_check check (length(key) > 8 and left(key, 2) in ('d:', 'f:', 'n:'))
);
create index if not exists drawup_account_keys_key_idx on public.drawup_account_keys (key);

alter table public.drawup_account_limit_meta enable row level security;
alter table public.drawup_account_links enable row level security;
alter table public.drawup_account_keys enable row level security;
revoke all on public.drawup_account_limit_meta from anon, authenticated;
revoke all on public.drawup_account_links from anon, authenticated;
revoke all on public.drawup_account_keys from anon, authenticated;
grant all on public.drawup_account_limit_meta to service_role;
grant all on public.drawup_account_links to service_role;
grant all on public.drawup_account_keys to service_role;

select 'DONE 0044 part 1 account limit tables' as status;

-- DrawUp V22 accounts (0044 part 2 of 6): email classification.
-- personal = well known free mail providers, school = .edu, .edu.xx, .ac.xx, k12 and school
-- domains, work = every other domain (firm or business). invalid = no usable domain.
-- Safe to run twice.

create or replace function public.drawup_email_kind(p_email text)
returns text
language sql immutable set search_path = public as $$
  with d as (
    select lower(trim(split_part(coalesce(p_email, 'x'), '@', 2))) as dom
  ), p as (
    select dom, split_part(dom, '.', 1) as brand, length(dom) - length(split_part(dom, '.', 1)) - 1 as rest from d
  )
  select case
    when position('.' in dom) = 0 or length(dom) < 4 then 'invalid'
    when dom like '%.edu' or dom like '%.edu.__' or dom like '%.ac.__' or dom like '%.k12.%'
      or dom like 'k12.%' or dom like '%.sch.__' or dom like '%.school.nz' then 'school'
    when dom = any (array[
      'gmail.com', 'googlemail.com', 'ymail.com', 'rocketmail.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
      'proton.me', 'pm.me', 'protonmail.com', 'protonmail.ch', 'mail.com', 'email.com', 'usa.com', 'zoho.com',
      'zohomail.com', 'ya.ru', 'tutanota.com', 'tutanota.de', 'tuta.io', 'tuta.com', 'fastmail.com', 'fastmail.fm',
      'hey.com', 'mail.ru', 'inbox.ru', 'bk.ru', 'list.ru', 'qq.com', '163.com', '126.com', 'yeah.net', 'sina.com',
      'naver.com', 'daum.net', 'hanmail.net', 'rediffmail.com', 'web.de', 't-online.de', 'freenet.de', 'free.fr',
      'orange.fr', 'laposte.net', 'sfr.fr', 'wanadoo.fr', 'libero.it', 'virgilio.it', 'btinternet.com', 'sky.com',
      'virginmedia.com', 'talktalk.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'comcast.net', 'verizon.net',
      'cox.net', 'charter.net', 'earthlink.net', 'optonline.net', 'juno.com', 'netzero.net', 'inbox.com', 'duck.com',
      'hushmail.com', 'mailfence.com', 'posteo.de', 'posteo.net', 'mailbox.org', 'rogers.com', 'shaw.ca',
      'sympatico.ca', 'bigpond.com', 'optusnet.com.au', 'xtra.co.nz', 'uol.com.br', 'bol.com.br', 'terra.com.br',
      'aim.com', 'lycos.com', 'startmail.com', 'gmx.com', 'gmx.net', 'gmx.de', 'yandex.com', 'yandex.ru'])
      then 'personal'
    -- Brands with many country domains (yahoo.co.uk, hotmail.fr, outlook.de, live.com.au ...).
    when rest between 2 and 6 and brand = any (array[
      'gmail', 'googlemail', 'yahoo', 'ymail', 'outlook', 'hotmail', 'live', 'windowslive', 'msn', 'aol',
      'gmx', 'yandex', 'protonmail', 'icloud', 'zoho', 'libero', 'rediffmail']) then 'personal'
    else 'work'
  end
  from p
$$;

-- personal accounts form one class, school and work accounts form the other.
create or replace function public.drawup_email_class(p_kind text)
returns text
language sql immutable as $$
  select case when p_kind = 'personal' then 'personal' when p_kind in ('school', 'work') then 'work' else 'other' end
$$;

grant execute on function public.drawup_email_kind(text) to service_role;
grant execute on function public.drawup_email_class(text) to service_role;

select 'DONE 0044 part 2 email kind' as status;

-- DrawUp V22 accounts (0044 part 3 of 6): grandfather every account that exists now.
-- The cutoff is written once, so running this again never grandfathers newer accounts.
-- Grandfathered accounts keep all their credits and count as linked. Safe to run twice.

insert into public.drawup_account_limit_meta (id, grandfather_cutoff)
values (1, now())
on conflict (id) do nothing;

insert into public.drawup_account_links (user_id, email_kind, status, reason, linked_at)
select u.id,
       public.drawup_email_kind(u.email),
       'grandfathered',
       null,
       now()
  from auth.users u
 where not coalesce(u.is_anonymous, false)
   and u.email is not null
   and u.created_at <= (select m.grandfather_cutoff from public.drawup_account_limit_meta m where m.id = 1)
on conflict (user_id) do nothing;

select 'DONE 0044 part 3 grandfather existing accounts' as status;

-- DrawUp V22 accounts (0044 part 4 of 6): the two account rule.
-- Finds the other accounts of the same person from hashed keys, then answers with a code:
-- ok, two_accounts, same_personal, same_work or invalid_email.
-- Same person means: the same device id, or the same browser fingerprint together with the
-- same network (unless p_strict is true, then the fingerprint alone is enough), plus accounts
-- that share a device id with those. Only accounts that are grandfathered or ok count, DrawUp
-- HQ accounts never count, and when p_user is given only accounts created before it count, so
-- an older account is never blocked by a newer one. Safe to run twice.

create or replace function public.drawup_account_rule(p_kind text, p_keys text[], p_user uuid, p_strict boolean default false)
returns text
language sql stable security definer set search_path = public as $$
  with k as (
    select distinct x as key from unnest(coalesce(p_keys, array[]::text[])) x where length(x) > 8
  ), direct as (
    select a.user_id from drawup_account_keys a join k on k.key = a.key where left(k.key, 2) = 'd:'
    union
    select a.user_id from drawup_account_keys a join k on k.key = a.key
     where left(k.key, 2) = 'f:'
       and (coalesce(p_strict, false) or exists (
         select 1 from drawup_account_keys n join k kn on kn.key = n.key
          where n.user_id = a.user_id and left(kn.key, 2) = 'n:'))
  ), hop as (
    select user_id from direct
    union
    select b.user_id from drawup_account_keys a
      join drawup_account_keys b on b.key = a.key and left(a.key, 2) = 'd:'
     where a.user_id in (select user_id from direct)
  ), others as (
    select l.user_id, l.email_kind
      from drawup_account_links l
      join hop on hop.user_id = l.user_id
      join auth.users u on u.id = l.user_id
      left join profiles pr on pr.id = l.user_id
     where l.user_id is distinct from p_user
       and l.status in ('ok', 'grandfathered')
       and coalesce(pr.account_type::text, 'member') not in ('founder', 'drawup_admin')
       and (p_user is null or u.created_at < coalesce((select me.created_at from auth.users me where me.id = p_user), now()))
  )
  select case
    when coalesce(p_kind, 'invalid') not in ('personal', 'school', 'work') then 'invalid_email'
    when (select count(*) from others) >= 2 then 'two_accounts'
    when exists (select 1 from others o where drawup_email_class(o.email_kind) = drawup_email_class(p_kind)) then
      case when p_kind = 'personal' then 'same_personal' else 'same_work' end
    else 'ok'
  end
$$;

-- Before sign up: may a new account with this email be created on this device.
create or replace function public.drawup_account_precheck(p_email text, p_keys text[], p_strict boolean default false)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kind', drawup_email_kind(p_email),
    'code', drawup_account_rule(drawup_email_kind(p_email), p_keys, null, p_strict))
$$;

revoke all on function public.drawup_account_rule(text, text[], uuid, boolean) from public, anon, authenticated;
revoke all on function public.drawup_account_precheck(text, text[], boolean) from public, anon, authenticated;
grant execute on function public.drawup_account_rule(text, text[], uuid, boolean) to service_role;
grant execute on function public.drawup_account_precheck(text, text[], boolean) to service_role;

select 'DONE 0044 part 4 account rule' as status;

-- DrawUp V22 accounts (0044 part 5 of 6): link an account to the hashed keys of the device it
-- signed up or signed in on, and record whether it passes the two account rule.
-- Called only by the DrawUp server (service role) right after sign up and on every sign in.
-- Grandfathered accounts stay grandfathered. DrawUp HQ accounts are recorded as hq (exempt).
-- Anonymous guest sessions are ignored. Safe to run twice.

create or replace function public.drawup_account_link(p_user_id uuid, p_keys text[], p_strict boolean default false)
returns jsonb
language sql volatile security definer set search_path = public as $$
  with u as (
    select id, email, coalesce(is_anonymous, false) as anon from auth.users where id = p_user_id
  ), hq as (
    select exists (select 1 from profiles p where p.id = p_user_id and p.account_type::text in ('founder', 'drawup_admin')) as v
  ), cur as (
    select status from drawup_account_links where user_id = p_user_id
  ), newk as (
    select distinct x as key from unnest(coalesce(p_keys, array[]::text[])) x
     where length(x) > 8 and left(x, 2) in ('d:', 'f:', 'n:')
  ), allk as (
    select array(select key from newk union select key from drawup_account_keys where user_id = p_user_id) as ks
  ), kind as (
    select drawup_email_kind((select email from u)) as k
  ), dec as (
    select case
      when not exists (select 1 from u) or (select anon from u) then 'none'
      when (select v from hq) then 'hq'
      when (select status from cur) = 'grandfathered' then 'grandfathered'
      else drawup_account_rule((select k from kind), (select ks from allk), p_user_id, p_strict)
    end as r
  ), ins as (
    insert into drawup_account_keys (user_id, key)
    select p_user_id, key from newk where (select r from dec) <> 'none'
    on conflict (user_id, key) do update set last_seen = now()
    returning 1
  ), up as (
    insert into drawup_account_links as l (user_id, email_kind, status, reason, linked_at)
    select p_user_id,
           (select k from kind),
           case when r in ('ok', 'hq', 'grandfathered') then r else 'blocked' end,
           case when r in ('ok', 'hq', 'grandfathered') then null else r end,
           case when r in ('ok', 'hq', 'grandfathered') then now() end
      from dec where r <> 'none'
    on conflict (user_id) do update
      set email_kind = excluded.email_kind,
          status = case when l.status = 'grandfathered' then l.status else excluded.status end,
          reason = case when l.status = 'grandfathered' then null else excluded.reason end,
          linked_at = coalesce(l.linked_at, excluded.linked_at),
          checked_at = now()
    returning status, reason
  )
  select jsonb_build_object(
    'ok', coalesce((select status from up) in ('ok', 'hq', 'grandfathered'), false),
    'status', coalesce((select status from up), 'none'),
    'reason', (select reason from up),
    'kind', (select k from kind),
    'keys_seen', (select count(*) from ins))
$$;

revoke all on function public.drawup_account_link(uuid, text[], boolean) from public, anon, authenticated;
grant execute on function public.drawup_account_link(uuid, text[], boolean) to service_role;

select 'DONE 0044 part 5 account link' as status;

-- DrawUp V22 accounts (0044 part 6 of 6): free allowance gate and the founder list.
-- drawup_account_allowance is checked by the DrawUp server before any free question, free
-- credits, trial or plan credits are used. An account that was never linked (for example one
-- made by calling Supabase sign up directly) or that breaks the two account rule gets no free
-- allowance. Grandfathered accounts, DrawUp HQ and accounts HQ gave unlimited access pass.
-- Safe to run twice.

create or replace function public.drawup_account_allowance(p_user_id uuid, p_strict boolean default false)
returns jsonb
language sql stable security definer set search_path = public as $$
  with l as (
    select dl.status, case when dl.email_kind = 'hq' then drawup_email_kind(u.email) else dl.email_kind end as kind
      from drawup_account_links dl join auth.users u on u.id = dl.user_id
     where dl.user_id = p_user_id
  ), hq as (
    select exists (select 1 from profiles p where p.id = p_user_id and p.account_type::text in ('founder', 'drawup_admin')) as v
  ), ul as (
    select coalesce((select a.unlimited_access from arch_coach_credit_accounts a where a.user_id = p_user_id), false) as v
  )
  select case
    when (select v from hq) then jsonb_build_object('ok', true, 'status', 'hq')
    when (select v from ul) then jsonb_build_object('ok', true, 'status', 'unlimited')
    when not exists (select 1 from l) then jsonb_build_object('ok', false, 'code', 'ACCOUNT_NOT_LINKED')
    when (select status from l) = 'grandfathered' then jsonb_build_object('ok', true, 'status', 'grandfathered')
    else (
      select case when z.r = 'ok' then jsonb_build_object('ok', true, 'status', 'ok')
             else jsonb_build_object('ok', false, 'code', 'ACCOUNT_LIMIT', 'reason', z.r) end
        from (select drawup_account_rule(l.kind, array(select k.key from drawup_account_keys k where k.user_id = p_user_id), p_user_id, p_strict) as r from l) z)
  end
$$;

-- Founder list: hashed device ids and fingerprints shared by more than one account.
-- Read only. The DrawUp server checks the founder account before calling it.
create or replace function public.drawup_account_pairs()
returns table (key_ref text, key_type text, accounts jsonb, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select left(k.key, 12),
         case when left(k.key, 2) = 'd:' then 'device' else 'fingerprint' end,
         jsonb_agg(jsonb_build_object(
           'email', u.email, 'kind', coalesce(l.email_kind, drawup_email_kind(u.email)),
           'status', coalesce(l.status, 'not linked'), 'reason', l.reason,
           'account_type', pr.account_type::text, 'created_at', u.created_at) order by u.created_at),
         max(k.last_seen)
    from drawup_account_keys k
    join auth.users u on u.id = k.user_id
    left join drawup_account_links l on l.user_id = k.user_id
    left join profiles pr on pr.id = k.user_id
   where left(k.key, 2) in ('d:', 'f:')
   group by k.key
  having count(distinct k.user_id) > 1
   order by max(k.last_seen) desc
   limit 200
$$;

revoke all on function public.drawup_account_allowance(uuid, boolean) from public, anon, authenticated;
revoke all on function public.drawup_account_pairs() from public, anon, authenticated;
grant execute on function public.drawup_account_allowance(uuid, boolean) to service_role;
grant execute on function public.drawup_account_pairs() to service_role;

select 'DONE 0044 part 6 allowance and founder list' as status;
-- END
