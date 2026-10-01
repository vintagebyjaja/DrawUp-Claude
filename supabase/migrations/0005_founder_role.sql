-- SEASON 1 — Migration 0005: Founder / HQ role
-- A single top-level account, above drawup_admin, for the person who owns
-- the whole platform. The technical enum value stays neutral ('founder');
-- the display label people actually see is a free-text column, so you can
-- set it to "HQ", "HNIC", "Founder" — whatever you want it to read as.

alter type account_type add value if not exists 'founder';

alter table profiles add column if not exists title text;

-- Treat 'founder' as carrying (at least) drawup_admin-level rights everywhere
-- is_drawup_admin() is already used as a gate, so nothing else has to change.
create or replace function is_drawup_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and account_type in ('drawup_admin', 'founder')
  );
$$;

create or replace function is_founder()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and account_type = 'founder'
  );
$$;

-- ---------------------------------------------------------------------
-- One-time bootstrap (run by hand, after you've signed up through the app
-- at least once so a profiles row exists for you):
--
--   update profiles
--   set account_type = 'founder', title = 'HQ'
--   where id = '<your-user-uuid-from-the-auth.users-table>';
--
-- Find your UUID in the Supabase dashboard under Authentication > Users,
-- or: select id, email from auth.users where email = 'you@example.com';
-- ---------------------------------------------------------------------
