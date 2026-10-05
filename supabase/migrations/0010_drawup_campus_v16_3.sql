-- DrawUp V16.3 Campus foundation
-- Additive schema. owner_admin remains separate/private and is never granted by campus tables.
create table if not exists public.campus_universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text, region text, country text,
  chair_name text, chair_title text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.campus_memberships (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('student','campus_manager','lead_campus_manager')),
  verified boolean not null default false,
  verified_at timestamptz,
  unique(university_id,user_id)
);
create table if not exists public.campus_organizations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  name text not null, org_type text,
  is_verified boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  unique(university_id,name)
);
create table if not exists public.campus_organization_managers (
  organization_id uuid not null references public.campus_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verified boolean not null default false,
  primary key(organization_id,user_id)
);
create table if not exists public.campus_posts (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.campus_universities(id) on delete cascade,
  organization_id uuid references public.campus_organizations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null default 'campus' check(post_type in ('campus','project','event','organization','opportunity')),
  body text, media_url text,
  visibility text not null default 'public' check(visibility in ('public','students')),
  status text not null default 'published' check(status in ('draft','submitted','published','removed')),
  created_at timestamptz not null default now()
);
alter table public.campus_universities enable row level security;
alter table public.campus_memberships enable row level security;
alter table public.campus_organizations enable row level security;
alter table public.campus_organization_managers enable row level security;
alter table public.campus_posts enable row level security;

-- Public university directory and public timeline.
drop policy if exists "public reads universities" on public.campus_universities;
create policy "public reads universities" on public.campus_universities for select using (true);
drop policy if exists "public reads organizations" on public.campus_organizations;
create policy "public reads organizations" on public.campus_organizations for select using (true);
drop policy if exists "public reads published campus posts" on public.campus_posts;
create policy "public reads published campus posts" on public.campus_posts for select using (status='published' and visibility='public');

-- A user can see their own campus membership/manager records.
drop policy if exists "users read own campus memberships" on public.campus_memberships;
create policy "users read own campus memberships" on public.campus_memberships for select using (user_id=auth.uid());
drop policy if exists "users read own org manager records" on public.campus_organization_managers;
create policy "users read own org manager records" on public.campus_organization_managers for select using (user_id=auth.uid());

-- Campus managers can update only their assigned university.
drop policy if exists "campus managers update assigned university" on public.campus_universities;
create policy "campus managers update assigned university" on public.campus_universities for update using (
  exists(select 1 from public.campus_memberships m where m.university_id=campus_universities.id and m.user_id=auth.uid() and m.verified and m.role in ('campus_manager','lead_campus_manager'))
) with check (
  exists(select 1 from public.campus_memberships m where m.university_id=campus_universities.id and m.user_id=auth.uid() and m.verified and m.role in ('campus_manager','lead_campus_manager'))
);

-- Verified campus managers can publish to their university. Verified organization managers can publish only to their assigned organization.
drop policy if exists "scoped managers create campus posts" on public.campus_posts;
create policy "scoped managers create campus posts" on public.campus_posts for insert with check (
  author_id=auth.uid() and (
    (organization_id is null and exists(select 1 from public.campus_memberships m where m.university_id=campus_posts.university_id and m.user_id=auth.uid() and m.verified and m.role in ('campus_manager','lead_campus_manager')))
    or
    (organization_id is not null and exists(select 1 from public.campus_organization_managers om join public.campus_organizations o on o.id=om.organization_id where om.organization_id=campus_posts.organization_id and om.user_id=auth.uid() and om.verified and o.university_id=campus_posts.university_id))
  )
);
