-- DrawUp v25-02: AI Design Team preferences (one row per member). Communication style, whether 6th Man and
-- Arch Coach may read the project's memory while on standby, short answers by default, read replies aloud.
-- The member reads and writes only their own row. Additive and safe to run twice.
create table if not exists public.team_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  style text not null default 'casual',
  sixth_man_aware boolean not null default true,
  coach_aware boolean not null default true,
  concise boolean not null default true,
  speak_replies boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint team_preferences_style_check check (style in ('professional','casual','creative','direct'))
);
alter table public.team_preferences enable row level security;
drop policy if exists "team prefs own read" on public.team_preferences;
create policy "team prefs own read" on public.team_preferences for select to authenticated using (user_id = auth.uid());
drop policy if exists "team prefs own insert" on public.team_preferences;
create policy "team prefs own insert" on public.team_preferences for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "team prefs own update" on public.team_preferences;
create policy "team prefs own update" on public.team_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "team prefs own delete" on public.team_preferences;
create policy "team prefs own delete" on public.team_preferences for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.team_preferences to authenticated;

select 'DONE v25-02 team preferences' as status;
