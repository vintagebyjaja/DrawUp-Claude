-- DrawUp v20 firms 03 of 03: save a featured list in one call, in order.
-- Runs as the caller (security invoker) so the row level security in file 02 decides who may write.
-- The list order becomes slots 1 to 6. A 7th project fails the firm_featured_max_six check.
-- An empty list clears the featured choice and the profile falls back to the most recent projects.

create or replace function public.drawup_set_featured(p_firm_id uuid, p_unit_id uuid, p_project_ids uuid[])
returns integer
language sql volatile security invoker set search_path = public as $$
  with cleared as (
    delete from public.firm_featured_projects
     where firm_id = p_firm_id and scope_id = coalesce(p_unit_id, p_firm_id)
     returning 1
  ),
  added as (
    insert into public.firm_featured_projects (firm_id, unit_id, project_id, slot)
    select p_firm_id, p_unit_id, x.pid, x.n::int
      from unnest(coalesce(p_project_ids, array[]::uuid[])) with ordinality as x(pid, n)
    returning 1
  )
  select (select count(*)::int from added) + 0 * (select count(*)::int from cleared)
$$;

revoke all on function public.drawup_set_featured(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.drawup_set_featured(uuid, uuid, uuid[]) to authenticated;

select 'DONE drawup-v20-firms-03' as status;
-- END
