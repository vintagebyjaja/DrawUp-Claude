-- DrawUp V13 — production profiles, founder setup, saved items, navigation preferences
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists pronouns text;
alter table public.profiles add column if not exists disciplines text[] not null default '{}';
alter table public.profiles add column if not exists credentials text[] not null default '{}';
alter table public.profiles add column if not exists linkedin_url text;
alter table public.profiles add column if not exists instagram_url text;
alter table public.profiles add column if not exists show_mobile_nav boolean not null default true;
alter table public.profiles add column if not exists profile_verified boolean not null default false;
alter table public.profiles add column if not exists founder_since date;
create unique index if not exists profiles_username_lower_unique on public.profiles(lower(username)) where username is not null;

create table if not exists public.saved_items (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 entity_type text not null check(entity_type in('project','firm','person','university','organization','resource','detail')),
 entity_key text not null,
 label text,
 created_at timestamptz not null default now(),
 unique(user_id,entity_type,entity_key)
);
alter table public.saved_items enable row level security;
drop policy if exists "users manage own saved items" on public.saved_items;
create policy "users manage own saved items" on public.saved_items for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- Founder bootstrap is intentionally NOT automatic. After signing up, use the UUID from Authentication > Users:
-- update public.profiles set account_type='founder', title='Founder & CEO', display_name='YOUR PUBLIC NAME',
--   username='YOUR_USERNAME', profile_verified=true, founder_since=current_date
-- where id='YOUR_AUTH_USER_UUID';
