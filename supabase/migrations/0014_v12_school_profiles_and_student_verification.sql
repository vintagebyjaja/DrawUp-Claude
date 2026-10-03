-- DrawUp V12: education/trade affiliations + private student-plan verification.
create table if not exists public.profile_education (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_name text not null,
  institution_type text not null default 'university',
  program text,
  degree_or_certificate text,
  start_year int,
  graduation_year int,
  status text not null default 'alumni' check (status in ('student','alumni','trade','apprentice','other')),
  is_primary boolean not null default false,
  discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profile_education_institution_idx on public.profile_education (lower(institution_name));
create index if not exists profile_education_grad_year_idx on public.profile_education (graduation_year);

create table if not exists public.student_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_name text not null,
  school_email text,
  school_email_verified_at timestamptz,
  evidence_type text check (evidence_type in ('student_id','class_schedule','enrollment_letter','transcript','other')),
  evidence_storage_path text,
  academic_year text,
  expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Student evidence is private. Service-role/admin workflows can review it; users can see only their own rows.
alter table public.profile_education enable row level security;
alter table public.student_verifications enable row level security;
drop policy if exists "education owner read" on public.profile_education;
create policy "education owner read" on public.profile_education for select using (auth.uid()=user_id or discoverable=true);
drop policy if exists "education owner write" on public.profile_education;
create policy "education owner write" on public.profile_education for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "student verification owner read" on public.student_verifications;
create policy "student verification owner read" on public.student_verifications for select using (auth.uid()=user_id);
drop policy if exists "student verification owner insert" on public.student_verifications;
create policy "student verification owner insert" on public.student_verifications for insert with check (auth.uid()=user_id);
