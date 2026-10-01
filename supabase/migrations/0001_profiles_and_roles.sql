-- SEASON 1 — Migration 0001: profiles, account types, roles
-- Run this first. Extends Supabase's built-in auth.users with a profiles
-- table the rest of the app (and RLS policies) can key off of.

create extension if not exists "pgcrypto";

create type account_type as enum (
  'free',
  'emerging',
  'firm_member',
  'firm_admin',
  'drawup_admin'
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  account_type account_type not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

alter table profiles enable row level security;

create policy "profiles are publicly readable"
  on profiles for select
  using (true);

create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Convenience: is the current user a DrawUp admin? Used by later RLS policies.
create or replace function is_drawup_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and account_type = 'drawup_admin'
  );
$$;
