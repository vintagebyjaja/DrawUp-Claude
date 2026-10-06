-- DrawUp V16.1: returning members with an established profile should not be forced through onboarding again.
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
update public.profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, updated_at, created_at, now())
where onboarding_completed_at is null
  and (nullif(trim(coalesce(display_name,'')),'') is not null
       or nullif(trim(coalesce(username,'')),'') is not null
       or nullif(trim(coalesce(primary_affiliation_name,'')),'') is not null);
