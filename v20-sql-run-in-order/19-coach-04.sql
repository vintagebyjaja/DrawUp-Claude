-- DrawUp V20 personal Arch Coach, file 4 of 5: row level security and column grants.
-- Members read and edit only their own coach. XP is never writable from the browser:
-- the xp column is left out of the insert and update grants, and the XP ledger is read only.

alter table public.arch_coach_profiles enable row level security;
alter table public.arch_coach_xp_events enable row level security;
alter table public.arch_coach_legends enable row level security;

revoke all on public.arch_coach_profiles from anon, authenticated;
revoke all on public.arch_coach_xp_events from anon, authenticated;
revoke all on public.arch_coach_legends from anon, authenticated;

grant select on public.arch_coach_profiles to authenticated;
grant insert (user_id, mode, appearance, discipline, focus, archetype, answer_style, skills, legend, language)
  on public.arch_coach_profiles to authenticated;
grant update (mode, appearance, discipline, focus, archetype, answer_style, skills, legend, language)
  on public.arch_coach_profiles to authenticated;
grant select on public.arch_coach_xp_events to authenticated;
grant select on public.arch_coach_legends to anon, authenticated;

drop policy if exists arch_coach_profiles_own_select on public.arch_coach_profiles;
create policy arch_coach_profiles_own_select on public.arch_coach_profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists arch_coach_profiles_own_insert on public.arch_coach_profiles;
create policy arch_coach_profiles_own_insert on public.arch_coach_profiles
  for insert to authenticated with check (user_id = auth.uid() and xp = 0);

drop policy if exists arch_coach_profiles_own_update on public.arch_coach_profiles;
create policy arch_coach_profiles_own_update on public.arch_coach_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists arch_coach_xp_events_own_select on public.arch_coach_xp_events;
create policy arch_coach_xp_events_own_select on public.arch_coach_xp_events
  for select to authenticated using (user_id = auth.uid());

drop policy if exists arch_coach_legends_read on public.arch_coach_legends;
create policy arch_coach_legends_read on public.arch_coach_legends
  for select to anon, authenticated using (true);

grant execute on function public.arch_coach_budget(integer) to anon, authenticated;
grant execute on function public.arch_coach_level(integer) to anon, authenticated;
grant execute on function public.arch_coach_skill_keys() to anon, authenticated;
grant execute on function public.arch_coach_default_skills() to anon, authenticated;

select 'DONE drawup-v20-coach-04' as status;
-- END
