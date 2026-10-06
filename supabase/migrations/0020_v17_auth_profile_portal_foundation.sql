-- DrawUp V17 — sign-in / profile / Portal / live-data foundation
--
-- ADDITIVE + IDEMPOTENT. Safe to run more than once, safe to run on the live
-- database after 0001–0019 and the V16.3 campus migration. Nothing here drops a
-- table, drops a column, deletes rows or overwrites a value a member saved.
--
-- What it does:
--   1. Every Auth user has exactly one profiles row (backfill + safer signup trigger).
--   2. Members can no longer promote themselves: account_type / is_admin /
--      verification flags are only writable by DrawUp admins/founder or the server.
--   3. Work-experience verification fields are no longer self-settable.
--   4. project_threads becomes the real "Projects" workspace (status, starter
--      project progress, delete own project).
--   5. Arch Coach threads/messages can be tied to a project and deleted by their owner.
--   6. firms get an is_demo flag (aec_projects already has one) so demo rows can
--      be hidden everywhere without deleting them.
--   7. drawup_search(): one real database search over firms + AEC projects
--      (never returns is_demo rows), used by the Portal and the public site.

-- Columns later sections rely on (no-ops when 0012–0019 already added them).
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists primary_affiliation_name text;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists profile_verified boolean not null default false;
alter table public.profiles add column if not exists affiliation_verified boolean not null default false;
alter table public.profiles add column if not exists founder_since date;
alter table public.career_timeline add column if not exists verified boolean not null default false;
alter table public.career_timeline add column if not exists verification_status text not null default 'unverified';
alter table public.career_timeline add column if not exists verified_at timestamptz;
alter table public.career_timeline add column if not exists verification_method text;

-- ---------------------------------------------------------------------------
-- 1. Profiles: one row per Auth user, never overwritten by sign-in
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''),'@',1), 'DrawUp Member'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, display_name)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'display_name',''), split_part(coalesce(u.email,''),'@',1), 'DrawUp Member')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Returning members who already finished onboarding keep their timestamp; members
-- with an established profile (from before onboarding existed) are marked done so
-- sign-in never sends them through onboarding again. Same rule as 0019, re-applied
-- for anyone created between 0019 and this release.
update public.profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, created_at, now())
where onboarding_completed_at is null
  and (nullif(trim(coalesce(username,'')),'') is not null
       or nullif(trim(coalesce(primary_affiliation_name,'')),'') is not null
       or exists (select 1 from public.career_timeline c where c.user_id = profiles.id)
       or exists (select 1 from public.profile_education e where e.user_id = profiles.id));

-- ---------------------------------------------------------------------------
-- 2. Privileged profile fields: only DrawUp admins/founder or the server
-- ---------------------------------------------------------------------------
-- Before this, the "users can update their own profile" policy let any signed-in
-- member run  update profiles set account_type='founder'  on their own row and
-- reach every is_drawup_admin() gate. Campus managers, organization managers and
-- students included.
create or replace function public.drawup_is_trusted_writer()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select auth.uid() is null                      -- SQL editor / migrations / service role without a user
      or coalesce(auth.role(),'') = 'service_role'
      or public.is_drawup_admin();
$$;

create or replace function public.drawup_protect_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.drawup_is_trusted_writer() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.account_type := 'free';
    new.is_admin := false;
    new.profile_verified := false;
    new.affiliation_verified := false;
    new.founder_since := null;
  else
    new.account_type := old.account_type;
    new.is_admin := old.is_admin;
    new.profile_verified := old.profile_verified;
    new.affiliation_verified := old.affiliation_verified;
    new.founder_since := old.founder_since;
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists drawup_protect_profile_privileges on public.profiles;
create trigger drawup_protect_profile_privileges
  before insert or update on public.profiles
  for each row execute procedure public.drawup_protect_profile_privileges();

-- ---------------------------------------------------------------------------
-- 3. Work experience: members write their history, not their verification
-- ---------------------------------------------------------------------------
alter table public.career_timeline add column if not exists updated_at timestamptz not null default now();

create or replace function public.drawup_protect_career_verification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.drawup_is_trusted_writer() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verified := false;
    new.verification_status := 'unverified';
    new.verified_at := null;
    new.verification_method := null;
  else
    new.verified := old.verified;
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.verification_method := old.verification_method;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists drawup_protect_career_verification on public.career_timeline;
create trigger drawup_protect_career_verification
  before insert or update on public.career_timeline
  for each row execute procedure public.drawup_protect_career_verification();

grant select, insert, update, delete on public.career_timeline to authenticated;
grant select, insert, update, delete on public.profile_education to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Projects workspace (project_threads from 0004)
-- ---------------------------------------------------------------------------
alter table public.project_threads add column if not exists status text not null default 'active';
alter table public.project_threads add column if not exists starter_key text;
alter table public.project_threads add column if not exists progress jsonb not null default '{}'::jsonb;
create unique index if not exists project_threads_owner_starter_unique
  on public.project_threads(owner_id, starter_key) where starter_key is not null;
create index if not exists project_threads_owner_idx on public.project_threads(owner_id, updated_at desc);

drop policy if exists "owner can delete their project thread" on public.project_threads;
create policy "owner can delete their project thread" on public.project_threads for delete
  using (owner_id = auth.uid() or is_drawup_admin());

grant select, insert, update, delete on public.project_threads to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Arch Coach threads: optional project link + owner delete
-- ---------------------------------------------------------------------------
alter table public.coach_threads add column if not exists project_thread_id uuid references public.project_threads(id) on delete set null;
create index if not exists coach_threads_owner_idx on public.coach_threads(owner_id, updated_at desc);
create index if not exists coach_messages_thread_idx on public.coach_messages(thread_id, created_at);

drop policy if exists "owner can delete their coach thread" on public.coach_threads;
create policy "owner can delete their coach thread" on public.coach_threads for delete
  using (owner_id = auth.uid() or is_drawup_admin());

grant select, insert, update, delete on public.coach_threads to authenticated;
grant select, insert on public.coach_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Demo flags
-- ---------------------------------------------------------------------------
alter table public.firms add column if not exists is_demo boolean not null default false;
alter table public.firms add column if not exists discipline text; -- 'architecture' | 'engineering' | 'construction' | 'multidisciplinary'
create index if not exists firms_name_lower_idx on public.firms (lower(name));
create index if not exists aec_projects_name_lower_idx on public.aec_projects (lower(name));

-- ---------------------------------------------------------------------------
-- 7. Real DrawUp search over the database
-- ---------------------------------------------------------------------------
create or replace function public.drawup_search(q text, kind text default 'all', max_rows int default 24)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with term as (
    select '%' || replace(replace(replace(trim(coalesce(q,'')),'\','\\'),'%','\%'),'_','\_') || '%' as like_q,
           lower(coalesce(kind,'all')) as k,
           least(greatest(coalesce(max_rows,24),1),50) as lim
  ),
  f as (
    select fi.id, fi.slug, fi.name, fi.description, fi.website, fi.logo_url, fi.hero_image_url,
           fi.is_verified, fi.discipline,
           (select string_agg(distinct concat_ws(', ', o.city, o.state, nullif(o.country,'US')), ' · ')
              from firm_offices o where o.firm_id = fi.id) as locations
    from firms fi, term
    where coalesce(fi.is_demo,false) = false
      and term.k in ('all','firms','firm')
      and (fi.name ilike term.like_q
           or fi.description ilike term.like_q
           or fi.discipline ilike term.like_q
           or exists (select 1 from firm_offices o where o.firm_id = fi.id and (o.city ilike term.like_q or o.state ilike term.like_q or o.country ilike term.like_q))
           or exists (select 1 from firm_services s where s.firm_id = fi.id and s.service ilike term.like_q)
           or exists (select 1 from firm_markets m where m.firm_id = fi.id and m.market ilike term.like_q))
    order by fi.is_verified desc, fi.name
    limit (select lim from term)
  ),
  p as (
    select pr.id, pr.slug, pr.name, pr.city, pr.state, pr.country, pr.project_type, pr.status,
           pr.completion_year, pr.description, pr.size_sqft,
           (select pi.image_url from project_images pi where pi.project_id = pr.id
              order by pi.is_hero desc, pi.sort_order, pi.id limit 1) as image_url,
           (select coalesce(jsonb_agg(jsonb_build_object('role', pf.role, 'firm', fx.name, 'slug', fx.slug, 'provenance', pf.provenance) order by pf.role), '[]'::jsonb)
              from project_firms pf join firms fx on fx.id = pf.firm_id
              where pf.project_id = pr.id and coalesce(fx.is_demo,false) = false) as team
    from aec_projects pr, term
    where pr.is_demo = false
      and term.k in ('all','projects','project')
      and (pr.name ilike term.like_q
           or pr.city ilike term.like_q
           or pr.state ilike term.like_q
           or pr.country ilike term.like_q
           or pr.project_type ilike term.like_q
           or pr.description ilike term.like_q
           or exists (select 1 from project_tags t where t.project_id = pr.id and t.tag ilike term.like_q)
           or exists (select 1 from project_firms pf join firms fx on fx.id = pf.firm_id
                       where pf.project_id = pr.id and fx.name ilike term.like_q))
    order by pr.completion_year desc nulls last, pr.name
    limit (select lim from term)
  )
  select jsonb_build_object(
    'query', q,
    'firms', coalesce((select jsonb_agg(to_jsonb(f)) from f), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(to_jsonb(p)) from p), '[]'::jsonb)
  );
$$;

grant execute on function public.drawup_search(text, text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Arch Coach thread policies: fix infinite recursion from 0004
-- ---------------------------------------------------------------------------
-- 0004's coach_threads policy reads thread_participants, whose policy reads
-- coach_threads again, so Postgres refused every coach_threads/coach_messages
-- query with "infinite recursion detected in policy". These helpers check
-- membership without re-entering RLS. Same access rules as before.
create or replace function public.drawup_coach_thread_owner(p_thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from coach_threads t where t.id = p_thread and t.owner_id = auth.uid());
$$;
create or replace function public.drawup_coach_thread_member(p_thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from coach_threads t where t.id = p_thread and t.owner_id = auth.uid())
      or exists (select 1 from thread_participants tp where tp.thread_id = p_thread and tp.user_id = auth.uid());
$$;

drop policy if exists "owner or participant can read their coach thread" on public.coach_threads;
create policy "owner or participant can read their coach thread" on public.coach_threads for select
  using (owner_id = auth.uid() or is_drawup_admin() or public.drawup_coach_thread_member(id));

drop policy if exists "participants readable by thread members" on public.thread_participants;
create policy "participants readable by thread members" on public.thread_participants for select
  using (user_id = auth.uid() or is_drawup_admin() or public.drawup_coach_thread_owner(thread_id));

drop policy if exists "messages readable by thread participants" on public.coach_messages;
create policy "messages readable by thread participants" on public.coach_messages for select
  using (is_drawup_admin() or public.drawup_coach_thread_member(thread_id));

drop policy if exists "participants can post messages" on public.coach_messages;
create policy "participants can post messages" on public.coach_messages for insert
  with check (public.drawup_coach_thread_member(thread_id));
