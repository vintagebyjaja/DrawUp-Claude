-- 0025 DrawUp V19: firm offices from member work history, firm-admin tools, project detail fields.
-- Additive and idempotent: only adds columns, functions, triggers and policies. Nothing is dropped
-- except policies/triggers that are re-created right after with the same or narrower access.

-- 1. Where office and project facts came from -------------------------------------------------
alter table public.firm_offices add column if not exists source text not null default 'directory';
alter table public.firm_offices add column if not exists source_url text;
alter table public.firm_offices add column if not exists address text;
alter table public.firm_offices add column if not exists is_confirmed boolean not null default false;
alter table public.firm_offices add column if not exists created_at timestamptz not null default now();
alter table public.firms add column if not exists founded_year integer;
alter table public.firms add column if not exists source_url text;
alter table public.firms add column if not exists research_note text;
alter table public.aec_projects add column if not exists street_address text;
alter table public.aec_projects add column if not exists opened_year integer;
alter table public.aec_projects add column if not exists owner_name text;
alter table public.aec_projects add column if not exists cost_text text;
alter table public.aec_projects add column if not exists capacity_text text;
alter table public.aec_projects add column if not exists size_text text;
alter table public.aec_projects add column if not exists key_facts jsonb not null default '[]'::jsonb;
alter table public.aec_projects add column if not exists conflicts jsonb not null default '[]'::jsonb;
alter table public.aec_projects add column if not exists image_page_url text;
alter table public.aec_projects add column if not exists created_by uuid;

-- 2. Matching a typed firm name / location to the directory ----------------------------------
create or replace function public.drawup_norm_firm(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(trim(regexp_replace(regexp_replace(regexp_replace(
    lower(replace(coalesce(p,''),'&',' and ')), '[^a-z0-9 ]+', ' ', 'g'),
    '\m(the|inc|llc|llp|pllc|pc|pa|ltd|co|corp|corporation|company)\M', ' ', 'g'), '\s+', ' ', 'g')), '');
$$;

create or replace function public.drawup_norm_firm_short(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(trim(regexp_replace(regexp_replace(coalesce(public.drawup_norm_firm(p),''),
    '\m(architects|architecture|architectural|engineers|engineering|design|designs|studio|studios|group|associates|partners|and)\M', ' ', 'g'), '\s+', ' ', 'g')), '');
$$;

create or replace function public.drawup_match_firm(p_name text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid; n int;
begin
  if public.drawup_norm_firm(p_name) is null then return null; end if;
  select id into v from firms where coalesce(is_demo,false)=false
    and public.drawup_norm_firm(name)=public.drawup_norm_firm(p_name) order by is_verified desc limit 1;
  if v is not null then return v; end if;
  if length(coalesce(public.drawup_norm_firm_short(p_name),''))<3 then return null; end if;
  select count(*), min(id::text)::uuid into n, v from firms where coalesce(is_demo,false)=false
    and public.drawup_norm_firm_short(name)=public.drawup_norm_firm_short(p_name);
  return case when n=1 then v else null end;
end $$;

create or replace function public.drawup_us_state_code(p text) returns text
language sql immutable set search_path = public as $$
  select case
    when upper(trim(coalesce(p,''))) ~ '^(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|PR|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$' then upper(trim(p))
    else (select c from (values ('alabama','AL'),('alaska','AK'),('arizona','AZ'),('arkansas','AR'),('california','CA'),('colorado','CO'),('connecticut','CT'),('delaware','DE'),('district of columbia','DC'),('washington dc','DC'),('florida','FL'),('georgia','GA'),('hawaii','HI'),('idaho','ID'),('illinois','IL'),('indiana','IN'),('iowa','IA'),('kansas','KS'),('kentucky','KY'),('louisiana','LA'),('maine','ME'),('maryland','MD'),('massachusetts','MA'),('michigan','MI'),('minnesota','MN'),('mississippi','MS'),('missouri','MO'),('montana','MT'),('nebraska','NE'),('nevada','NV'),('new hampshire','NH'),('new jersey','NJ'),('new mexico','NM'),('new york','NY'),('north carolina','NC'),('north dakota','ND'),('ohio','OH'),('oklahoma','OK'),('oregon','OR'),('pennsylvania','PA'),('puerto rico','PR'),('rhode island','RI'),('south carolina','SC'),('south dakota','SD'),('tennessee','TN'),('texas','TX'),('utah','UT'),('vermont','VT'),('virginia','VA'),('washington','WA'),('west virginia','WV'),('wisconsin','WI'),('wyoming','WY')) s(n,c)
          where s.n = lower(regexp_replace(trim(coalesce(p,'')),'[.]','','g')))
  end;
$$;

-- "Richmond, VA" / "Charlotte, North Carolina, USA" / "London, United Kingdom" -> city, state, country
create or replace function public.drawup_parse_location(p text, out city text, out state text, out country text)
language plpgsql immutable set search_path = public as $$
declare parts text[]; last text; st text;
begin
  parts := array_remove(array(select nullif(trim(x),'') from unnest(string_to_array(regexp_replace(coalesce(p,''),'\s+',' ','g'), ',')) x), null);
  if coalesce(array_length(parts,1),0)=0 then return; end if;
  city := case when parts[1] ~ '[A-Z]' then parts[1] else initcap(parts[1]) end;
  if city ~ '^[0-9]' or length(city) > 60 then city := null; return; end if;
  if array_length(parts,1)=1 then country := 'US'; return; end if;
  last := parts[array_length(parts,1)];
  if lower(last) in ('us','usa','u.s.','u.s.a.','united states','united states of america') then
    country := 'US'; st := case when array_length(parts,1)>=3 then parts[2] end;
  else
    st := parts[2];
    if public.drawup_us_state_code(regexp_replace(st,'\s+\d{5}(-\d{4})?$','')) is null then
      country := last; return;
    end if;
    country := 'US';
  end if;
  state := public.drawup_us_state_code(regexp_replace(coalesce(st,''),'\s+\d{5}(-\d{4})?$',''));
end $$;

-- 3. Member work history -> firm office (member reported) + firm membership ------------------
create or replace function public.drawup_link_member_firm(p_user uuid, p_org text, p_location text, p_current boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_firm uuid; loc record;
begin
  if p_user is null or coalesce(trim(p_org),'')='' then return null; end if;
  v_firm := public.drawup_match_firm(p_org);
  if v_firm is null then return null; end if;
  select * into loc from public.drawup_parse_location(p_location);
  if loc.city is not null and not exists (
      select 1 from firm_offices o where o.firm_id=v_firm and lower(o.city)=lower(loc.city)
        and coalesce(lower(o.state),'')=coalesce(lower(loc.state),'')
        and case when coalesce(loc.country,'US')='US' then lower(coalesce(o.country,'US')) in ('us','usa','united states','united states of america')
                 else lower(o.country)=lower(loc.country) end) then
    insert into firm_offices(firm_id, city, state, country, is_headquarters, source, is_confirmed)
    values (v_firm, loc.city, loc.state, coalesce(loc.country,'US'), false, 'member_reported', false);
  end if;
  if p_current then
    insert into firm_members(firm_id, user_id, role) values (v_firm, p_user, 'member')
    on conflict (firm_id, user_id) do nothing;
  end if;
  return v_firm;
end $$;
revoke all on function public.drawup_link_member_firm(uuid,text,text,boolean) from public, anon, authenticated;

create or replace function public.drawup_career_firm_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.drawup_link_member_firm(new.user_id, new.organization, new.location, new.end_date is null);
  return new;
exception when others then
  return new; -- never block saving a profile because of the directory link
end $$;
drop trigger if exists drawup_career_firm_link on public.career_timeline;
create trigger drawup_career_firm_link after insert or update of organization, location, end_date
  on public.career_timeline for each row execute function public.drawup_career_firm_trigger();

create or replace function public.drawup_profile_firm_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.primary_affiliation_type,'firm') in ('firm','company','employer','work','professional') then
    perform public.drawup_link_member_firm(new.id, new.primary_affiliation_name, coalesce(nullif(new.home_office,''), new.current_location), true);
  end if;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists drawup_profile_firm_link on public.profiles;
create trigger drawup_profile_firm_link after insert or update of primary_affiliation_name, primary_affiliation_type, home_office
  on public.profiles for each row execute function public.drawup_profile_firm_trigger();

-- Backfill from work history and profiles already saved.
select public.drawup_link_member_firm(c.user_id, c.organization, c.location, c.end_date is null)
  from public.career_timeline c where c.organization is not null;
select public.drawup_link_member_firm(p.id, p.primary_affiliation_name, coalesce(nullif(p.home_office,''), p.current_location), true)
  from public.profiles p where p.primary_affiliation_name is not null
  and coalesce(p.primary_affiliation_type,'firm') in ('firm','company','employer','work','professional');

-- 4. Firm admins: what they can and cannot change ---------------------------------------------
create or replace function public.drawup_guard_firm_privileged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.drawup_is_trusted_writer() then return new; end if;
  if new.is_verified is distinct from old.is_verified or new.is_demo is distinct from old.is_demo
     or new.slug is distinct from old.slug or new.subscription_tier is distinct from old.subscription_tier then
    raise exception 'Only DrawUp HQ can change verification, plan or the profile address of a firm.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists drawup_guard_firm_privileged on public.firms;
create trigger drawup_guard_firm_privileged before update on public.firms
  for each row execute function public.drawup_guard_firm_privileged();

create or replace function public.drawup_guard_project_privileged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.drawup_is_trusted_writer() then return new; end if;
  if new.is_demo is distinct from old.is_demo or new.slug is distinct from old.slug or new.created_by is distinct from old.created_by then
    raise exception 'Only DrawUp HQ can change a project''s address or demo flag.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists drawup_guard_project_privileged on public.aec_projects;
create trigger drawup_guard_project_privileged before update on public.aec_projects
  for each row execute function public.drawup_guard_project_privileged();

create or replace function public.drawup_can_edit_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_drawup_admin() or exists (
    select 1 from project_firms pf where pf.project_id = p_project and public.is_firm_admin(pf.firm_id));
$$;

-- Firm admins can manage photos, team, sources, people, tags and awards on projects their firm is on.
drop policy if exists "firm admins manage images on their projects" on public.project_images;
create policy "firm admins manage images on their projects" on public.project_images for all
  using (public.drawup_can_edit_project(project_id)) with check (public.drawup_can_edit_project(project_id));
drop policy if exists "firm admins manage sources on their projects" on public.project_sources;
create policy "firm admins manage sources on their projects" on public.project_sources for all
  using (public.drawup_can_edit_project(project_id)) with check (public.drawup_can_edit_project(project_id));
drop policy if exists "firm admins manage people on their projects" on public.project_people;
create policy "firm admins manage people on their projects" on public.project_people for all
  using (public.drawup_can_edit_project(project_id)) with check (public.drawup_can_edit_project(project_id));
drop policy if exists "firm admins manage tags on their projects" on public.project_tags;
create policy "firm admins manage tags on their projects" on public.project_tags for all
  using (public.drawup_can_edit_project(project_id)) with check (public.drawup_can_edit_project(project_id));
drop policy if exists "firm admins manage awards on their projects" on public.project_awards;
create policy "firm admins manage awards on their projects" on public.project_awards for all
  using (public.drawup_can_edit_project(project_id)) with check (public.drawup_can_edit_project(project_id));
-- Team credits: a firm admin can add collaborators to their own projects and edit their own firm's
-- credit, but cannot remove or rewrite another firm's credit once it is past "unverified".
drop policy if exists "firm admins add team on their projects" on public.project_firms;
create policy "firm admins add team on their projects" on public.project_firms for insert
  with check (public.drawup_can_edit_project(project_id) and (provenance in ('unverified','user_submitted')
    or (provenance = 'firm_verified' and public.is_firm_admin(firm_id))));
drop policy if exists "firm admins edit team on their projects" on public.project_firms;
create policy "firm admins edit team on their projects" on public.project_firms for update
  using (public.is_firm_admin(firm_id) or (public.drawup_can_edit_project(project_id) and provenance in ('unverified','user_submitted')))
  with check (public.drawup_can_edit_project(project_id) and (provenance in ('unverified','user_submitted')
    or (provenance = 'firm_verified' and public.is_firm_admin(firm_id))));
drop policy if exists "firm admins remove team on their projects" on public.project_firms;
create policy "firm admins remove team on their projects" on public.project_firms for delete
  using (public.is_firm_admin(firm_id) or (public.drawup_can_edit_project(project_id) and provenance in ('unverified','user_submitted')));

-- Create a project for your firm (the project is credited to the firm right away).
create or replace function public.drawup_firm_create_project(p_firm_id uuid, p_name text, p_role text default 'Architecture',
  p_city text default null, p_state text default null, p_country text default 'US', p_project_type text default null,
  p_completion_year integer default null, p_status text default null, p_description text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_slug text; v_base text; v_id uuid; n int := 1;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  if not (public.is_firm_admin(p_firm_id) or public.is_drawup_admin()) then
    raise exception 'Only an admin of this firm can add projects for it.' using errcode='42501';
  end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Project name is required.'; end if;
  v_base := trim(both '-' from regexp_replace(lower(p_name || coalesce('-' || p_city,'')), '[^a-z0-9]+', '-', 'g'));
  v_slug := v_base;
  while exists (select 1 from aec_projects where slug = v_slug) loop n := n + 1; v_slug := v_base || '-' || n; end loop;
  insert into aec_projects(slug, name, city, state, country, project_type, completion_year, status, description, is_demo, created_by)
  values (v_slug, trim(p_name), nullif(trim(p_city),''), nullif(trim(p_state),''), coalesce(nullif(trim(p_country),''),'US'),
          nullif(trim(p_project_type),''), p_completion_year, nullif(trim(p_status),''), nullif(trim(p_description),''), false, auth.uid())
  returning id into v_id;
  insert into project_firms(project_id, firm_id, role, provenance)
  values (v_id, p_firm_id, coalesce(nullif(trim(p_role),''),'Architecture'), 'firm_verified');
  return jsonb_build_object('id', v_id, 'slug', v_slug);
end $$;
grant execute on function public.drawup_firm_create_project(uuid,text,text,text,text,text,text,integer,text,text) to authenticated;

-- Delete a project you created (or any project, for DrawUp HQ).
create or replace function public.drawup_firm_delete_project(p_project_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_drawup_admin() or exists (select 1 from aec_projects where id = p_project_id and created_by = auth.uid()
          and public.drawup_can_edit_project(p_project_id))) then
    raise exception 'You can only remove projects you added.' using errcode='42501';
  end if;
  delete from aec_projects where id = p_project_id;
  return true;
end $$;
grant execute on function public.drawup_firm_delete_project(uuid) to authenticated;

-- Firms a signed-in member is an admin of (for the Portal Firm tab).
create or replace function public.drawup_my_firms() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'slug', f.slug, 'name', f.name, 'role', m.role) order by m.role, f.name), '[]'::jsonb)
  from firm_members m join firms f on f.id = m.firm_id where m.user_id = auth.uid();
$$;
grant execute on function public.drawup_my_firms() to authenticated;
