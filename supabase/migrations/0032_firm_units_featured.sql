-- 0032: firm units (locations, studios, departments) and featured projects. Same content as deliverables drawup-v20-firms-01..03.
-- DrawUp v20 firms 01 of 03: locations, studios and departments under a firm.
-- Additive and idempotent. Creates new tables only. Nothing is dropped or rewritten.
-- Existing firm_offices rows are NOT copied: the profile reads them directly and an
-- office only becomes a unit row when a firm admin gives it its own profile page.

create table if not exists public.firm_units (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  slug text not null,
  name text not null,
  kind text not null default 'studio',
  office_id uuid references public.firm_offices(id) on delete set null,
  city text,
  state text,
  country text default 'US',
  description text,
  leader_name text,
  leader_title text,
  hero_image_url text,
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint firm_units_kind_check check (kind in ('office', 'studio', 'department', 'practice')),
  constraint firm_units_slug_check check (slug = lower(slug) and slug !~ '[^a-z0-9-]' and length(slug) between 1 and 80),
  constraint firm_units_name_check check (length(trim(name)) > 0),
  constraint firm_units_firm_slug_key unique (firm_id, slug),
  constraint firm_units_id_firm_key unique (id, firm_id)
);
create index if not exists firm_units_firm_idx on public.firm_units (firm_id, sort_order);

create table if not exists public.firm_unit_photos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  firm_id uuid not null,
  image_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint firm_unit_photos_unit_fkey foreign key (unit_id, firm_id) references public.firm_units(id, firm_id) on delete cascade
);
create index if not exists firm_unit_photos_unit_idx on public.firm_unit_photos (unit_id, sort_order);

create table if not exists public.firm_unit_projects (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  firm_id uuid not null,
  project_id uuid not null references public.aec_projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint firm_unit_projects_unit_fkey foreign key (unit_id, firm_id) references public.firm_units(id, firm_id) on delete cascade,
  constraint firm_unit_projects_unique unique (unit_id, project_id)
);
create index if not exists firm_unit_projects_project_idx on public.firm_unit_projects (project_id);

-- Members choose which office or studio they belong to. Their own choice, removable any time.
create table if not exists public.firm_unit_members (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null,
  firm_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  constraint firm_unit_members_unit_fkey foreign key (unit_id, firm_id) references public.firm_units(id, firm_id) on delete cascade,
  constraint firm_unit_members_unique unique (unit_id, user_id)
);

-- Featured work: up to 6 ordered slots per firm (unit_id null) and per unit.
-- The slot check makes a 7th featured project impossible in the database itself.
create table if not exists public.firm_featured_projects (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  unit_id uuid,
  project_id uuid not null references public.aec_projects(id) on delete cascade,
  slot integer not null,
  scope_id uuid generated always as (coalesce(unit_id, firm_id)) stored,
  created_at timestamptz not null default now(),
  constraint firm_featured_max_six check (slot between 1 and 6),
  constraint firm_featured_unit_fkey foreign key (unit_id, firm_id) references public.firm_units(id, firm_id) on delete cascade,
  constraint firm_featured_scope_project_key unique (scope_id, project_id) deferrable initially deferred,
  constraint firm_featured_scope_slot_key unique (scope_id, slot) deferrable initially deferred
);
create index if not exists firm_featured_firm_idx on public.firm_featured_projects (firm_id, unit_id, slot);

grant select on public.firm_units, public.firm_unit_photos, public.firm_unit_projects, public.firm_unit_members, public.firm_featured_projects to anon, authenticated;
grant insert, update, delete on public.firm_units, public.firm_unit_photos, public.firm_unit_projects, public.firm_unit_members, public.firm_featured_projects to authenticated;

select 'DONE drawup-v20-firms-01' as status;
-- END
-- DrawUp v20 firms 02 of 03: row level security for units, unit photos, unit projects,
-- unit members and featured projects. Public read. Only admins of that firm (or DrawUp HQ) write.
-- Members may add or remove only themselves on a unit of a firm they belong to.

alter table public.firm_units enable row level security;
alter table public.firm_unit_photos enable row level security;
alter table public.firm_unit_projects enable row level security;
alter table public.firm_unit_members enable row level security;
alter table public.firm_featured_projects enable row level security;

drop policy if exists "firm units are publicly readable" on public.firm_units;
create policy "firm units are publicly readable" on public.firm_units for select using (true);
drop policy if exists "firm admins manage units" on public.firm_units;
create policy "firm admins manage units" on public.firm_units for all
  using (public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check ((public.is_firm_admin(firm_id) or public.is_drawup_admin())
    and (office_id is null or exists (select 1 from public.firm_offices fo where fo.id = office_id and fo.firm_id = firm_units.firm_id)));

drop policy if exists "unit photos are publicly readable" on public.firm_unit_photos;
create policy "unit photos are publicly readable" on public.firm_unit_photos for select using (true);
drop policy if exists "firm admins manage unit photos" on public.firm_unit_photos;
create policy "firm admins manage unit photos" on public.firm_unit_photos for all
  using (public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check (public.is_firm_admin(firm_id) or public.is_drawup_admin());

drop policy if exists "unit projects are publicly readable" on public.firm_unit_projects;
create policy "unit projects are publicly readable" on public.firm_unit_projects for select using (true);
drop policy if exists "firm admins manage unit projects" on public.firm_unit_projects;
create policy "firm admins manage unit projects" on public.firm_unit_projects for all
  using (public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check ((public.is_firm_admin(firm_id) or public.is_drawup_admin())
    and exists (select 1 from public.project_firms pf where pf.project_id = firm_unit_projects.project_id and pf.firm_id = firm_unit_projects.firm_id));

drop policy if exists "unit members are publicly readable" on public.firm_unit_members;
create policy "unit members are publicly readable" on public.firm_unit_members for select using (true);
drop policy if exists "members join a unit of their own firm" on public.firm_unit_members;
create policy "members join a unit of their own firm" on public.firm_unit_members for insert
  with check (public.is_firm_admin(firm_id) or public.is_drawup_admin()
    or (user_id = auth.uid() and (
      exists (select 1 from public.firm_members m where m.firm_id = firm_unit_members.firm_id and m.user_id = auth.uid())
      or exists (select 1 from public.drawup_firm_roster(firm_unit_members.firm_id) r where r.user_id = auth.uid() and r.is_current))));
drop policy if exists "members edit their own unit row" on public.firm_unit_members;
create policy "members edit their own unit row" on public.firm_unit_members for update
  using (user_id = auth.uid() or public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check (user_id = auth.uid() or public.is_firm_admin(firm_id) or public.is_drawup_admin());
drop policy if exists "members leave a unit" on public.firm_unit_members;
create policy "members leave a unit" on public.firm_unit_members for delete
  using (user_id = auth.uid() or public.is_firm_admin(firm_id) or public.is_drawup_admin());

drop policy if exists "featured projects are publicly readable" on public.firm_featured_projects;
create policy "featured projects are publicly readable" on public.firm_featured_projects for select using (true);
drop policy if exists "firm admins choose featured projects" on public.firm_featured_projects;
create policy "firm admins choose featured projects" on public.firm_featured_projects for all
  using (public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check ((public.is_firm_admin(firm_id) or public.is_drawup_admin())
    and exists (select 1 from public.project_firms pf where pf.project_id = firm_featured_projects.project_id and pf.firm_id = firm_featured_projects.firm_id));

select 'DONE drawup-v20-firms-02' as status;
-- END
-- DrawUp v20 firms 03 of 03: save a featured list in one call, in order.
-- Runs as the caller (security invoker) so the row level security in file 02 decides who may write.
-- The list order becomes slots 1 to 6. A 7th project fails the firm_featured_max_six check.
-- An empty list clears the featured choice and the profile falls back to the most recent projects.

create or replace function public.drawup_set_featured(p_firm_id uuid, p_unit_id uuid, p_project_ids uuid[])
returns integer
language sql volatile security invoker set search_path = public as $$
  with cleared as (
    delete from public.firm_featured_projects
     where firm_id = p_firm_id and scope_id = coalesce(p_unit_id, p_firm_id)
     returning 1
  ),
  added as (
    insert into public.firm_featured_projects (firm_id, unit_id, project_id, slot)
    select p_firm_id, p_unit_id, x.pid, x.n::int
      from unnest(coalesce(p_project_ids, array[]::uuid[])) with ordinality as x(pid, n)
    returning 1
  )
  select (select count(*)::int from added) + 0 * (select count(*)::int from cleared)
$$;

revoke all on function public.drawup_set_featured(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.drawup_set_featured(uuid, uuid, uuid[]) to authenticated;

select 'DONE drawup-v20-firms-03' as status;
-- END
