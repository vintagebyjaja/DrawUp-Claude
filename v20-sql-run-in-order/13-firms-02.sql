-- DrawUp v20 firms 02 of 03: row level security for units, unit photos, unit projects,
-- unit members and featured projects. Public read. Only admins of that firm (or DrawUp HQ) write.
-- Members may add or remove only themselves on a unit of a firm they belong to.

alter table public.firm_units enable row level security;
alter table public.firm_unit_photos enable row level security;
alter table public.firm_unit_projects enable row level security;
alter table public.firm_unit_members enable row level security;
alter table public.firm_featured_projects enable row level security;

drop policy if exists "firm units are publicly readable" on public.firm_units;
create policy "firm units are publicly readable" on public.firm_units for select using (true);
drop policy if exists "firm admins manage units" on public.firm_units;
create policy "firm admins manage units" on public.firm_units for all
  using (public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check ((public.is_firm_admin(firm_id) or public.is_drawup_admin())
    and (office_id is null or exists (select 1 from public.firm_offices fo where fo.id = office_id and fo.firm_id = firm_units.firm_id)));

drop policy if exists "unit photos are publicly readable" on public.firm_unit_photos;
create policy "unit photos are publicly readable" on public.firm_unit_photos for select using (true);
drop policy if exists "firm admins manage unit photos" on public.firm_unit_photos;
create policy "firm admins manage unit photos" on public.firm_unit_photos for all
  using (public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check (public.is_firm_admin(firm_id) or public.is_drawup_admin());

drop policy if exists "unit projects are publicly readable" on public.firm_unit_projects;
create policy "unit projects are publicly readable" on public.firm_unit_projects for select using (true);
drop policy if exists "firm admins manage unit projects" on public.firm_unit_projects;
create policy "firm admins manage unit projects" on public.firm_unit_projects for all
  using (public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check ((public.is_firm_admin(firm_id) or public.is_drawup_admin())
    and exists (select 1 from public.project_firms pf where pf.project_id = firm_unit_projects.project_id and pf.firm_id = firm_unit_projects.firm_id));

drop policy if exists "unit members are publicly readable" on public.firm_unit_members;
create policy "unit members are publicly readable" on public.firm_unit_members for select using (true);
drop policy if exists "members join a unit of their own firm" on public.firm_unit_members;
create policy "members join a unit of their own firm" on public.firm_unit_members for insert
  with check (public.is_firm_admin(firm_id) or public.is_drawup_admin()
    or (user_id = auth.uid() and (
      exists (select 1 from public.firm_members m where m.firm_id = firm_unit_members.firm_id and m.user_id = auth.uid())
      or exists (select 1 from public.drawup_firm_roster(firm_unit_members.firm_id) r where r.user_id = auth.uid() and r.is_current))));
drop policy if exists "members edit their own unit row" on public.firm_unit_members;
create policy "members edit their own unit row" on public.firm_unit_members for update
  using (user_id = auth.uid() or public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check (user_id = auth.uid() or public.is_firm_admin(firm_id) or public.is_drawup_admin());
drop policy if exists "members leave a unit" on public.firm_unit_members;
create policy "members leave a unit" on public.firm_unit_members for delete
  using (user_id = auth.uid() or public.is_firm_admin(firm_id) or public.is_drawup_admin());

drop policy if exists "featured projects are publicly readable" on public.firm_featured_projects;
create policy "featured projects are publicly readable" on public.firm_featured_projects for select using (true);
drop policy if exists "firm admins choose featured projects" on public.firm_featured_projects;
create policy "firm admins choose featured projects" on public.firm_featured_projects for all
  using (public.is_firm_admin(firm_id) or public.is_drawup_admin())
  with check ((public.is_firm_admin(firm_id) or public.is_drawup_admin())
    and exists (select 1 from public.project_firms pf where pf.project_id = firm_featured_projects.project_id and pf.firm_id = firm_featured_projects.firm_id));

select 'DONE drawup-v20-firms-02' as status;
-- END
