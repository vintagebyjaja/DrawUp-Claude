-- SEASON 1 — Migration 0003: Project Search + Project Profiles + "Who Designed It"
-- (Phase S1-3). Every attribution row carries a provenance state — never
-- implicit, never fabricated.

create type provenance_state as enum (
  'firm_verified',
  'owner_verified',
  'public_source',
  'user_submitted',
  'unverified'
);

create type project_claim_status as enum ('pending', 'approved', 'rejected');

create table aec_projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text,
  state text,
  country text not null default 'US',
  project_type text, -- 'healthcare' | 'education' | 'hospitality' | ...
  completion_year int,
  status text default 'completed', -- 'completed' | 'in_progress' | 'proposed'
  description text,
  size_sqft int,
  is_demo boolean not null default false, -- Section 62: clearly label seeded demo content
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  image_url text not null,
  is_hero boolean not null default false,
  caption text,
  sort_order int not null default 0
);

-- Links a project to the firm(s) that worked on it, with a role and
-- provenance — this is the heart of "Who Designed It?"
create table project_firms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  role text not null, -- 'architect' | 'engineer' | 'contractor' | 'consultant'
  provenance provenance_state not null default 'unverified',
  created_at timestamptz not null default now()
);

create table project_people (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  name text not null,
  role text, -- 'lead architect' | ...
  provenance provenance_state not null default 'unverified'
);

create table project_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  role_name text not null,
  party_name text not null -- owner/developer/contractor name when not a DrawUp firm record
);

create table project_consultants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  discipline text not null,
  firm_name text not null,
  firm_id uuid references firms(id)
);

-- Every third-party fact needs a source. Never republish copyrighted
-- editorial text — store the link + metadata only (Section 13).
create table project_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  source_name text not null, -- e.g. 'ArchDaily', 'Firm website'
  source_url text not null,
  retrieved_at timestamptz not null default now()
);

create table project_awards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  award_name text not null,
  award_year int,
  provenance provenance_state not null default 'unverified'
);

create table project_tags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  tag text not null
);

create table project_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  firm_id uuid references firms(id),
  user_id uuid not null references profiles(id),
  status project_claim_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id)
);

create table project_verifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aec_projects(id) on delete cascade,
  verified_at timestamptz not null default now(),
  verified_by uuid references profiles(id)
);

alter table aec_projects enable row level security;
alter table project_images enable row level security;
alter table project_firms enable row level security;
alter table project_people enable row level security;
alter table project_roles enable row level security;
alter table project_consultants enable row level security;
alter table project_sources enable row level security;
alter table project_awards enable row level security;
alter table project_tags enable row level security;
alter table project_claims enable row level security;
alter table project_verifications enable row level security;

-- Public read everywhere on project content (this is the discovery product).
create policy "projects are publicly readable" on aec_projects for select using (true);
create policy "project images are publicly readable" on project_images for select using (true);
create policy "project firms are publicly readable" on project_firms for select using (true);
create policy "project people are publicly readable" on project_people for select using (true);
create policy "project roles are publicly readable" on project_roles for select using (true);
create policy "project consultants are publicly readable" on project_consultants for select using (true);
create policy "project sources are publicly readable" on project_sources for select using (true);
create policy "project awards are publicly readable" on project_awards for select using (true);
create policy "project tags are publicly readable" on project_tags for select using (true);

-- Writes limited to: a firm admin editing a project they're attributed to,
-- or a DrawUp admin. (First write happens via project_claims approval flow.)
create policy "firm admins edit their attributed projects" on aec_projects for update
  using (
    is_drawup_admin() or exists (
      select 1 from project_firms pf
      where pf.project_id = aec_projects.id and is_firm_admin(pf.firm_id)
    )
  );

create policy "users manage their own project claims" on project_claims for select
  using (user_id = auth.uid() or is_drawup_admin());
create policy "users can submit a project claim" on project_claims for insert
  with check (user_id = auth.uid());
create policy "drawup admins review project claims" on project_claims for update
  using (is_drawup_admin());

create policy "verifications readable by all, writable by drawup admins" on project_verifications
  for select using (true);
create policy "only drawup admins write project verifications" on project_verifications
  for insert with check (is_drawup_admin());

-- Index support for Section 51's unified search.
create index idx_aec_projects_search on aec_projects
  using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(city,'') || ' ' || coalesce(description,'')));
create index idx_firms_search on firms
  using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));
