do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
-- Minimal Supabase stand-in for SQL tests (roles, auth.uid() from request.jwt.claims, the tables the Season 1
-- migrations reference). Test-only.

create schema auth; create schema storage;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id serial primary key, bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
alter table storage.objects enable row level security;
insert into storage.buckets values ('drawup-private','drawup-private',false);
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
create table public.profiles(id uuid primary key references auth.users(id), display_name text, account_type text default 'free');
create table public.firms(id uuid primary key default gen_random_uuid(), name text);
create table public.firm_members(firm_id uuid references public.firms(id), user_id uuid references public.profiles(id), role text default 'member');
create function public.drawup_is_firm_member(f uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.firm_members where firm_id=f and user_id=auth.uid()) $$;
create function public.is_firm_admin(f uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.firm_members where firm_id=f and user_id=auth.uid() and role='admin') $$;
create table public.project_threads(id uuid primary key default gen_random_uuid(), owner_id uuid references public.profiles(id), firm_id uuid references public.firms(id), project_name text, status text default 'active', starter_key text);
grant usage on schema public, auth, storage to authenticated; grant select on public.project_threads, public.profiles to authenticated; grant execute on function auth.uid() to authenticated;
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
insert into public.profiles(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
insert into public.firms values ('ffffffff-0000-4000-8000-000000000001','KEi');
insert into public.firm_members values ('ffffffff-0000-4000-8000-000000000001','33333333-3333-4333-8333-333333333333','member');
insert into public.project_threads(id, owner_id, firm_id, project_name) values
 ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',null,'Mine'),
 ('aaaaaaaa-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',null,'Theirs'),
 ('aaaaaaaa-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ffffffff-0000-4000-8000-000000000001','Firm project');
