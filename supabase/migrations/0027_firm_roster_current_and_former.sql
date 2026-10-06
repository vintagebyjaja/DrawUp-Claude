-- DrawUp v19: firm roster (current and former team) built from members' work history.
-- Additive and idempotent. Read-only function; only discoverable profiles are listed.

create index if not exists career_timeline_org_idx on public.career_timeline (lower(organization));

create or replace function public.drawup_firm_roster(p_firm_id uuid)
returns table (
  user_id uuid, display_name text, username text, avatar_url text,
  role text, location text, start_year int, end_year int,
  is_current boolean, verified boolean
)
language sql stable security definer set search_path = public as $$
  with stints as (
    select c.user_id, c.role, c.location,
           extract(year from c.start_date)::int as start_year,
           extract(year from c.end_date)::int as end_year,
           c.end_date is null as is_current,
           coalesce(c.verified, false) as verified
      from career_timeline c
     where coalesce(trim(c.organization), '') <> ''
       and public.drawup_match_firm(c.organization) = p_firm_id
  ),
  affiliated as (
    -- people who list the firm as their workplace but have no work-history row for it yet
    select p.id as user_id, p.title as role, p.home_office as location,
           null::int as start_year, null::int as end_year, true as is_current, false as verified
      from profiles p
     where coalesce(trim(p.primary_affiliation_name), '') <> ''
       and public.drawup_match_firm(p.primary_affiliation_name) = p_firm_id
       and not exists (select 1 from stints s where s.user_id = p.id)
  )
  select r.user_id, p.display_name, p.username, p.avatar_url,
         r.role, r.location, r.start_year, r.end_year, r.is_current, r.verified
    from (select * from stints union all select * from affiliated) r
    join profiles p on p.id = r.user_id
   where coalesce(p.discoverable, true) and coalesce(p.is_public, true)
     and p.display_name is not null
   order by r.is_current desc, r.end_year desc nulls first, r.start_year asc nulls last, p.display_name;
$$;

revoke all on function public.drawup_firm_roster(uuid) from public;
grant execute on function public.drawup_firm_roster(uuid) to anon, authenticated;
