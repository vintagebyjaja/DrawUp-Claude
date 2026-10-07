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
