-- DrawUp V15.9 — consolidated profile persistence + experience verification foundation
-- Safe to run more than once.

alter table public.profiles add column if not exists title text;
alter table public.profiles add column if not exists pronouns text;
alter table public.profiles add column if not exists current_location text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists disciplines text[] not null default '{}';
alter table public.profiles add column if not exists credentials text[] not null default '{}';
alter table public.profiles add column if not exists primary_affiliation_type text;
alter table public.profiles add column if not exists primary_affiliation_name text;
alter table public.profiles add column if not exists affiliation_verified boolean not null default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_interests text[] not null default '{}';
alter table public.profiles add column if not exists discoverable boolean not null default true;
alter table public.profiles add column if not exists profile_verified boolean not null default false;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_username_lower_unique
  on public.profiles(lower(username)) where username is not null;

-- Ensure every existing Auth user has a profile row.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email,'@',1), 'DrawUp Member')
from auth.users u
where not exists (select 1 from public.profiles p where p.id=u.id)
on conflict (id) do nothing;

-- Current user can always read/update their own profile. Public discovery remains readable.
alter table public.profiles enable row level security;
drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile" on public.profiles for update using (auth.uid()=id) with check (auth.uid()=id);
drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile" on public.profiles for insert with check (auth.uid()=id);

create table if not exists public.career_timeline(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null,
 organization text,
 location text,
 start_date date,
 end_date date,
 description text,
 sort_order integer default 0,
 verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
 verified_at timestamptz,
 verification_method text,
 created_at timestamptz default now()
);
alter table public.career_timeline add column if not exists verification_status text not null default 'unverified';
alter table public.career_timeline add column if not exists verified_at timestamptz;
alter table public.career_timeline add column if not exists verification_method text;
alter table public.career_timeline enable row level security;
drop policy if exists "own career timeline write" on public.career_timeline;
create policy "own career timeline write" on public.career_timeline for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create table if not exists public.profile_education (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 institution_name text not null, institution_type text not null default 'university', program text,
 degree_or_certificate text, start_year int, graduation_year int, status text not null default 'alumni',
 is_primary boolean not null default false, discoverable boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.profile_education enable row level security;
drop policy if exists "education owner write" on public.profile_education;
create policy "education owner write" on public.profile_education for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- Community Details eligibility is 4+ years VERIFIED firm experience, not self-entered years alone.
create or replace function public.drawup_verified_firm_experience_years(p_user uuid)
returns numeric language sql stable security definer set search_path=public as $$
  select coalesce(sum(greatest(0, extract(epoch from (coalesce(end_date,current_date)::timestamp - start_date::timestamp))/31557600.0)),0)
  from public.career_timeline
  where user_id=p_user and verification_status='verified' and start_date is not null and organization is not null;
$$;
