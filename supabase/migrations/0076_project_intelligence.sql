-- 0076 Season 1 Project Intelligence: one project information record per project.
-- Additive and safe to run twice. Nothing existing is changed or dropped.
--   1. drawup_project_access(project) : who may read/write a project's information (owner, or a member of the
--      firm the project belongs to).
--   2. project_profiles  : the project's information. Each field keeps where it came from:
--        fields = { key: { v, src, url, at, conf, by: 'auto'|'user', verified, note } }
--      plus site (coordinates), program (spaces), team, milestones, decisions, files (surveys, photos) and
--      lookups (when public sources were last asked, and what answered).
--   3. project_profile_changes : one row per changed field (who, when, old and new value). Document Studio uses
--      it to tell members which documents use a value that changed.
-- Draw, CheckUp, DrawUp Specs and Document Studio read the same row.

-- ===== 1. access
create or replace function public.drawup_project_access(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_threads t
     where t.id = p_project
       and (t.owner_id = auth.uid() or (t.firm_id is not null and public.drawup_is_firm_member(t.firm_id)))
  );
$$;
revoke all on function public.drawup_project_access(uuid) from public;
grant execute on function public.drawup_project_access(uuid) to authenticated;

-- ===== 2. project_profiles
create table if not exists public.project_profiles (
  project_thread_id uuid primary key references public.project_threads(id) on delete cascade,
  fields jsonb not null default '{}'::jsonb,
  site jsonb not null default '{}'::jsonb,
  program jsonb not null default '[]'::jsonb,
  team jsonb not null default '[]'::jsonb,
  milestones jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  lookups jsonb not null default '[]'::jsonb,
  rev integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  constraint project_profiles_fields_obj check (jsonb_typeof(fields) = 'object'),
  constraint project_profiles_site_obj check (jsonb_typeof(site) = 'object'),
  constraint project_profiles_lists check (jsonb_typeof(program) = 'array' and jsonb_typeof(team) = 'array' and jsonb_typeof(milestones) = 'array'
    and jsonb_typeof(decisions) = 'array' and jsonb_typeof(files) = 'array' and jsonb_typeof(lookups) = 'array'),
  constraint project_profiles_size check (pg_column_size(fields) + pg_column_size(program) + pg_column_size(decisions) < 2000000)
);
alter table public.project_profiles enable row level security;
grant select, insert, update on public.project_profiles to authenticated;

drop policy if exists "project profile read" on public.project_profiles;
create policy "project profile read" on public.project_profiles for select to authenticated
  using (public.drawup_project_access(project_thread_id));
drop policy if exists "project profile insert" on public.project_profiles;
create policy "project profile insert" on public.project_profiles for insert to authenticated
  with check (public.drawup_project_access(project_thread_id));
drop policy if exists "project profile update" on public.project_profiles;
create policy "project profile update" on public.project_profiles for update to authenticated
  using (public.drawup_project_access(project_thread_id)) with check (public.drawup_project_access(project_thread_id));

-- ===== 3. change log (written by the trigger only)
create table if not exists public.project_profile_changes (
  id bigserial primary key,
  project_thread_id uuid not null references public.project_threads(id) on delete cascade,
  rev integer not null,
  key text not null,
  old_value text,
  new_value text,
  source text,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists project_profile_changes_idx on public.project_profile_changes(project_thread_id, changed_at desc);
alter table public.project_profile_changes enable row level security;
grant select on public.project_profile_changes to authenticated;
drop policy if exists "project profile changes read" on public.project_profile_changes;
create policy "project profile changes read" on public.project_profile_changes for select to authenticated
  using (public.drawup_project_access(project_thread_id));

create or replace function public.project_profiles_track()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text; o jsonb; n jsonb; changed boolean := false;
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if tg_op = 'INSERT' then
    new.rev := 1;
    return new;
  end if;
  for k in select distinct x from (select jsonb_object_keys(old.fields) x union select jsonb_object_keys(new.fields)) s loop
    o := old.fields -> k; n := new.fields -> k;
    if coalesce(o ->> 'v', '') is distinct from coalesce(n ->> 'v', '') then
      changed := true;
      insert into public.project_profile_changes(project_thread_id, rev, key, old_value, new_value, source)
      values (new.project_thread_id, old.rev + 1, k, left(o ->> 'v', 2000), left(n ->> 'v', 2000), left(n ->> 'src', 200));
    end if;
  end loop;
  new.rev := case when changed or new.program is distinct from old.program then old.rev + 1 else old.rev end;
  return new;
end $$;
drop trigger if exists project_profiles_track on public.project_profiles;
create trigger project_profiles_track before insert or update on public.project_profiles
  for each row execute function public.project_profiles_track();

select 'DONE project-intelligence-0076' as status;
