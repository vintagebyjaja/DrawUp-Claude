-- DrawUp V6: global directory foundation
create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(), name text not null, country_code text not null, country_name text not null, continent text not null, region_state text, city text, website_url text, department_url text, claimed boolean default false, verified boolean default false, created_at timestamptz default now()
);
create table if not exists public.university_programs (
  id uuid primary key default gen_random_uuid(), university_id uuid references public.universities(id) on delete cascade, discipline text not null, degree_level text, program_name text, study_abroad boolean default false, language text, program_url text, created_at timestamptz default now()
);
create index if not exists universities_geo_idx on public.universities(continent,country_code,region_state);
create index if not exists university_programs_discipline_idx on public.university_programs(discipline,study_abroad);
-- Existing firm/project tables can use their location fields for global records; app UI now exposes country/continent/state filters.
