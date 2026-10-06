-- DrawUp V15.8: persistence + contributor verification support
alter table if exists public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table if exists public.profiles add column if not exists onboarding_interests text[] default '{}';
alter table if exists public.profiles add column if not exists affiliation_verified boolean not null default false;
alter table if exists public.career_timeline add column if not exists verified boolean not null default false;
alter table if exists public.career_timeline add column if not exists verification_method text;

create table if not exists public.details(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null, category text not null default 'Custom', description text, visibility text not null default 'private' check(visibility in ('private','firm','drawup')),
 firm_name text, status text not null default 'submitted' check(status in ('submitted','reviewing','published','needs_changes','removed')),
 preview_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.detail_assets(
 id bigint generated always as identity primary key, detail_id uuid not null references public.details(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, file_name text not null, file_ext text, storage_path text not null,
 public_url text, file_size bigint, created_at timestamptz not null default now()
);
alter table public.details enable row level security; alter table public.detail_assets enable row level security;
drop policy if exists "details readable" on public.details; create policy "details readable" on public.details for select using(status='published' and visibility='drawup' or owner_id=auth.uid());
drop policy if exists "details own write" on public.details; create policy "details own write" on public.details for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists "detail assets readable" on public.detail_assets; create policy "detail assets readable" on public.detail_assets for select using(owner_id=auth.uid() or exists(select 1 from public.details d where d.id=detail_id and d.status='published' and d.visibility='drawup'));
drop policy if exists "detail assets own write" on public.detail_assets; create policy "detail assets own write" on public.detail_assets for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
insert into storage.buckets(id,name,public) values('drawup-files','drawup-files',true) on conflict(id) do update set public=true;
drop policy if exists "drawup files authenticated upload" on storage.objects; create policy "drawup files authenticated upload" on storage.objects for insert to authenticated with check(bucket_id='drawup-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "drawup files public read" on storage.objects; create policy "drawup files public read" on storage.objects for select using(bucket_id='drawup-files');
