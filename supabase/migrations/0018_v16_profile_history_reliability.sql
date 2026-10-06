-- DrawUp V16 — profile history reliability + edit support
-- Safe to run after V15.9. Idempotent.

alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.career_timeline add column if not exists description text;
alter table public.career_timeline add column if not exists sort_order integer default 0;
alter table public.profile_education add column if not exists updated_at timestamptz not null default now();

create index if not exists career_timeline_user_idx on public.career_timeline(user_id);
create index if not exists profile_education_user_idx on public.profile_education(user_id);

alter table public.career_timeline enable row level security;
alter table public.profile_education enable row level security;

drop policy if exists "career owner read" on public.career_timeline;
create policy "career owner read" on public.career_timeline for select using (auth.uid()=user_id);
drop policy if exists "own career timeline write" on public.career_timeline;
create policy "own career timeline write" on public.career_timeline for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "education owner read" on public.profile_education;
create policy "education owner read" on public.profile_education for select using (auth.uid()=user_id or discoverable=true);
drop policy if exists "education owner write" on public.profile_education;
create policy "education owner write" on public.profile_education for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

grant select,insert,update,delete on public.career_timeline to authenticated;
grant select,insert,update,delete on public.profile_education to authenticated;
grant select,insert,update on public.profiles to authenticated;
grant usage,select on all sequences in schema public to authenticated;
