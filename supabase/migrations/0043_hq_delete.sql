-- DrawUp V22 HQ founder delete tools (migration 0043). Additive and idempotent.
-- Same content as drawup-v22-hqdelete-01..04.sql in the v22 sql-parts/hqdelete deliverables.
-- Files 02, 03 and 04 contain plpgsql function bodies.

-- ===== drawup-v22-hqdelete-01-audit.sql
-- DrawUp V22 HQ delete, file 1 of 4: founder check and the deletion log. Migration 0043.
-- Additive and idempotent. New table and functions only. Nothing existing is dropped or changed.
-- Plain SQL only (no plpgsql in this file).

-- True only when the signed in member is the DrawUp founder account.
-- drawup_admin, campus or organization managers, firm admins and members all get false.
create or replace function public.hq_is_founder()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_type::text = 'founder'
  )
$fn$;

revoke all on function public.hq_is_founder() from public;
grant execute on function public.hq_is_founder() to authenticated, service_role;

-- Every HQ deletion (accounts, posts, files) is written here.
-- actor_id has no foreign key on purpose so the log survives when accounts are removed.
create table if not exists public.hq_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_label text,
  kind text not null,
  target_id text,
  label text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hq_audit_created_idx on public.hq_audit (created_at desc);

alter table public.hq_audit enable row level security;

-- Only the founder can read the log. Nobody can write it from the browser:
-- rows are added by the server (service role) and by hq_delete_account.
drop policy if exists hq_audit_founder_read on public.hq_audit;
create policy hq_audit_founder_read on public.hq_audit
  for select to authenticated
  using (public.hq_is_founder());

revoke all on table public.hq_audit from anon;
revoke insert, update, delete, truncate on table public.hq_audit from authenticated;
grant select on table public.hq_audit to authenticated;
grant all on table public.hq_audit to service_role;

select 'DONE hqdelete-01-audit' as status;
-- END

-- ===== drawup-v22-hqdelete-02-delete-account.sql
-- DrawUp V22 HQ delete, file 2 of 4: hq_delete_account. Migration 0043.
-- Additive and idempotent (create or replace). CONTAINS PLPGSQL (the function body has semicolons).
-- Reads the catalog at run time, so tables added later are handled too. A blocking reference to the
-- account (NO ACTION / RESTRICT) is set to null when nullable, otherwise that row is deleted. Rows that
-- point at rows the cascade will remove get the same treatment one level down. created_by style columns
-- are set to null so shared firms, universities, projects and chats survive. Then the auth user is
-- deleted (cascading the profile and what the account owns). Storage files are removed by the HQ server
-- route with the Storage API, because hosted Supabase blocks SQL deletes on storage.objects.
create or replace function public.hq_delete_account(p_user uuid, p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare
  v_email text; v_name text; v_type text; v_actor text; r record; n int;
  v_nulled int := 0; v_removed int := 0; v_audit bigint;
begin
  if auth.uid() is not null and not public.hq_is_founder() then
    raise exception 'Only the DrawUp founder account can delete accounts' using errcode = '42501';
  end if;
  select u.email::text into v_email from auth.users u where u.id = p_user;
  select p.display_name, p.account_type::text into v_name, v_type from public.profiles p where p.id = p_user;
  if v_email is null and v_type is null and not exists (select 1 from auth.users where id = p_user) then
    return jsonb_build_object('deleted', false, 'reason', 'not found', 'user_id', p_user);
  end if;
  if v_type = 'founder' or lower(coalesce(v_email, 'none')) in ('vintagebyjaja@gmail.com', 'jaja@vybr8.live') then
    raise exception 'This account is protected and cannot be deleted' using errcode = '42501';
  end if;
  -- One level down: rows pointing at rows that the cascade is about to remove.
  for r in
    select cn.nspname as sch, cc.relname as tbl, ca.attname as col, ca.attnotnull as nn,
           pn.nspname as psch, pc.relname as ptbl, pa.attname as pcol, oa.attname as ocol
    from pg_constraint o
    join pg_attribute oa on oa.attrelid = o.conrelid and oa.attnum = o.conkey[1]
    join pg_class pc on pc.oid = o.conrelid join pg_namespace pn on pn.oid = pc.relnamespace
    join pg_constraint k on k.confrelid = o.conrelid and k.contype = 'f' and k.confdeltype in ('a', 'r') and cardinality(k.conkey) = 1
    join pg_attribute ca on ca.attrelid = k.conrelid and ca.attnum = k.conkey[1]
    join pg_attribute pa on pa.attrelid = k.confrelid and pa.attnum = k.confkey[1]
    join pg_class cc on cc.oid = k.conrelid join pg_namespace cn on cn.oid = cc.relnamespace
    where o.contype = 'f' and o.confdeltype = 'c' and cardinality(o.conkey) = 1
      and o.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and o.conrelid <> 'public.profiles'::regclass
  loop
    if r.nn then
      execute format('delete from %I.%I where %I in (select %I from %I.%I where %I = %L)', r.sch, r.tbl, r.col, r.pcol, r.psch, r.ptbl, r.ocol, p_user);
      get diagnostics n = row_count; v_removed := v_removed + n;
    else
      execute format('update %I.%I set %I = null where %I in (select %I from %I.%I where %I = %L)', r.sch, r.tbl, r.col, r.col, r.pcol, r.psch, r.ptbl, r.ocol, p_user);
      get diagnostics n = row_count; v_nulled := v_nulled + n;
    end if;
  end loop;
  -- Direct references to the account that would block the delete.
  for r in
    select cn.nspname as sch, cc.relname as tbl, a.attname as col, a.attnotnull as nn
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_class cc on cc.oid = k.conrelid join pg_namespace cn on cn.oid = cc.relnamespace
    where k.contype = 'f' and cardinality(k.conkey) = 1
      and k.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and (k.confdeltype in ('a', 'r') or (k.confdeltype = 'n' and a.attnotnull))
  loop
    if r.nn then
      execute format('delete from %I.%I where %I = %L', r.sch, r.tbl, r.col, p_user);
      get diagnostics n = row_count; v_removed := v_removed + n;
    else
      execute format('update %I.%I set %I = null where %I = %L', r.sch, r.tbl, r.col, r.col, p_user);
      get diagnostics n = row_count; v_nulled := v_nulled + n;
    end if;
  end loop;
  -- created_by style columns, with or without a foreign key (aec_projects, firm_units ...).
  for r in
    select c.table_schema as sch, c.table_name as tbl, c.column_name as col
    from information_schema.columns c join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.data_type = 'uuid' and c.is_nullable = 'YES'
      and c.column_name in ('created_by', 'added_by', 'updated_by', 'reviewed_by', 'verified_by', 'approved_by', 'invited_by')
  loop
    execute format('update %I.%I set %I = null where %I = %L', r.sch, r.tbl, r.col, r.col, p_user);
    get diagnostics n = row_count; v_nulled := v_nulled + n;
  end loop;
  delete from auth.users where id = p_user;
  delete from public.profiles where id = p_user;
  select u.email::text into v_actor from auth.users u where u.id = coalesce(p_actor, auth.uid());
  insert into public.hq_audit (actor_id, actor_label, kind, target_id, label, detail)
  values (coalesce(p_actor, auth.uid()), coalesce(v_actor, 'SQL editor'), 'account', p_user::text,
          left(coalesce(case when length(trim(v_email)) > 0 then v_email end, v_name, 'guest account'), 200),
          jsonb_build_object('account_type', v_type, 'name', v_name, 'nulled', v_nulled, 'removed_blocking_rows', v_removed))
  returning id into v_audit;
  return jsonb_build_object('deleted', true, 'user_id', p_user, 'email', v_email, 'name', v_name,
    'nulled', v_nulled, 'removed_blocking_rows', v_removed, 'audit_id', v_audit);
end
$fn$;

revoke all on function public.hq_delete_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.hq_delete_account(uuid, uuid) to service_role;

select 'DONE hqdelete-02-delete-account' as status;
-- END

-- ===== drawup-v22-hqdelete-03-accounts.sql
-- DrawUp V22 HQ delete, file 3 of 4: account list with what each account owns. Migration 0043.
-- Additive and idempotent (create or replace). CONTAINS PLPGSQL (hq_accounts_owned body).
-- hq_accounts and hq_account_files are plain SQL.

-- Row counts per table for a set of accounts, read from the catalog (every column that
-- references auth.users or profiles), plus how many Storage files sit in their folders.
create or replace function public.hq_accounts_owned(p_users uuid[])
returns table (user_id uuid, owned jsonb)
language plpgsql
stable
security definer
set search_path = public, auth, storage
as $fn$
declare
  r record; q record; res jsonb := '{}'::jsonb; cur jsonb;
begin
  for r in
    select cn.nspname as sch, cc.relname as tbl, a.attname as col
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_class cc on cc.oid = k.conrelid join pg_namespace cn on cn.oid = cc.relnamespace
    where k.contype = 'f' and cardinality(k.conkey) = 1 and cn.nspname = 'public'
      and k.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and k.conrelid <> 'public.profiles'::regclass
  loop
    for q in execute format('select %I::text as uid, count(*)::int as n from %I.%I where %I = any(%L::uuid[]) group by 1', r.col, r.sch, r.tbl, r.col, p_users)
    loop
      cur := coalesce(res -> q.uid, '{}'::jsonb);
      cur := cur || jsonb_build_object(r.tbl, coalesce((cur ->> r.tbl)::int, 0) + q.n);
      res := res || jsonb_build_object(q.uid, cur);
    end loop;
  end loop;
  for q in
    select split_part(o.name, '/', 1) as uid, count(*)::int as n from storage.objects o
    where split_part(o.name, '/', 1) in (select x::text from unnest(p_users) x) group by 1
  loop
    cur := coalesce(res -> q.uid, '{}'::jsonb);
    res := res || jsonb_build_object(q.uid, cur || jsonb_build_object('storage_files', q.n));
  end loop;
  return query select x, coalesce(res -> x::text, '{}'::jsonb) from unnest(p_users) x;
end
$fn$;

-- Accounts for the HQ Accounts list. Search by email, name or username.
create or replace function public.hq_accounts(p_query text default null, p_limit int default 100)
returns table (id uuid, email text, display_name text, username text, account_type text,
               is_anonymous boolean, created_at timestamptz, last_sign_in_at timestamptz, owned jsonb)
language sql
stable
security definer
set search_path = public, auth
as $fn$
  with base as (
    select u.id, u.email::text as email, p.display_name, p.username, coalesce(p.account_type::text, 'none') as account_type,
           coalesce(u.is_anonymous, false) as is_anonymous, u.created_at, u.last_sign_in_at
    from auth.users u left join public.profiles p on p.id = u.id
    where p_query is null or length(trim(p_query)) = 0
       or u.email ilike '%' || trim(p_query) || '%'
       or p.display_name ilike '%' || trim(p_query) || '%'
       or p.username ilike '%' || trim(p_query) || '%'
       or u.id::text = trim(p_query)
    order by u.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  select b.id, b.email, b.display_name, b.username, b.account_type, b.is_anonymous, b.created_at, b.last_sign_in_at, o.owned
  from base b left join public.hq_accounts_owned(array(select id from base)) o on o.user_id = b.id
  order by b.created_at desc
$fn$;

-- Storage files in an account folder (first path segment is the account id) or owned by it.
create or replace function public.hq_account_files(p_user uuid)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = public, storage
as $fn$
  select o.bucket_id::text, o.name::text from storage.objects o
  where split_part(o.name, '/', 1) = p_user::text or o.owner_id = p_user::text or o.owner = p_user
$fn$;

revoke all on function public.hq_accounts_owned(uuid[]) from public, anon, authenticated;
revoke all on function public.hq_accounts(text, int) from public, anon, authenticated;
revoke all on function public.hq_account_files(uuid) from public, anon, authenticated;
grant execute on function public.hq_accounts_owned(uuid[]) to service_role;
grant execute on function public.hq_accounts(text, int) to service_role;
grant execute on function public.hq_account_files(uuid) to service_role;

select 'DONE hqdelete-03-accounts' as status;
-- END

-- ===== drawup-v22-hqdelete-04-files.sql
-- DrawUp V22 HQ delete, file 4 of 4: which Storage files are still used. Migration 0043.
-- Additive and idempotent (create or replace). CONTAINS PLPGSQL (hq_paths_in_use body).
-- hq_leftover_files is plain SQL. Nothing here deletes anything: the HQ server route
-- removes files with the Storage API after these checks.

-- Returns the given Storage paths that still appear in any text, array or json column of
-- any public table (a firm logo, a project photo, a post image, a detail file ...).
-- Files that are still in use are kept even when the account that uploaded them is removed.
create or replace function public.hq_paths_in_use(p_names text[])
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  r record; found text[] := '{}'; hit text[];
begin
  if p_names is null or cardinality(p_names) = 0 then
    return;
  end if;
  for r in
    select c.table_name as tbl, c.column_name as col
    from information_schema.columns c join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.table_name <> 'hq_audit'
      and (c.data_type in ('text', 'character varying', 'jsonb', 'json') or c.udt_name in ('_text', '_varchar'))
  loop
    execute format('select coalesce(array_agg(n), array[]::text[]) from unnest(%L::text[]) n where exists (select 1 from public.%I t where position(n in t.%I::text) > 0)', p_names, r.tbl, r.col)
      into hit;
    found := found || hit;
  end loop;
  return query select distinct x from unnest(found) x;
end
$fn$;

-- Files left in Storage folders of accounts that no longer exist (for example accounts removed
-- by the one time cleanup SQL, which cannot delete Storage files). The HQ screen shows how many
-- there are and removes the ones that nothing uses any more.
create or replace function public.hq_leftover_files(p_limit int default 1000)
returns table (bucket_id text, name text, bytes bigint, created_at timestamptz)
language sql
stable
security definer
set search_path = public, auth, storage
as $fn$
  select o.bucket_id::text, o.name::text, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at
  from storage.objects o
  where length(split_part(o.name, '/', 1)) = 36
    and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    and not exists (select 1 from auth.users u where u.id::text = split_part(o.name, '/', 1))
    and not exists (select 1 from public.firms f where f.id::text = split_part(o.name, '/', 1))
    and not exists (select 1 from public.aec_projects a where a.id::text = split_part(o.name, '/', 1))
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 1000), 5000))
$fn$;

revoke all on function public.hq_paths_in_use(text[]) from public, anon, authenticated;
revoke all on function public.hq_leftover_files(int) from public, anon, authenticated;
grant execute on function public.hq_paths_in_use(text[]) to service_role;
grant execute on function public.hq_leftover_files(int) to service_role;

select 'DONE hqdelete-04-files' as status;
-- END
