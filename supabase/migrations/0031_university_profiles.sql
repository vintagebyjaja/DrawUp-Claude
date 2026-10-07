-- DrawUp v20: public university profiles.
-- Additive and idempotent. Adds two optional tag columns and one read-only function.
-- Nothing is dropped or rewritten.

alter table public.aec_projects add column if not exists campus_name text;
create index if not exists aec_projects_campus_idx on public.aec_projects (lower(campus_name));

alter table public.connect_posts add column if not exists university_name text;
create index if not exists connect_posts_university_idx on public.connect_posts (lower(university_name));

-- One call returns everything a university profile shows. Only public, discoverable data.
create or replace function public.drawup_university_profile(p_names text[])
returns jsonb
language sql stable security definer set search_path = public as $$
  with names as (
    select distinct lower(trim(n)) as n from unnest(p_names) n where length(trim(n)) > 1
  ),
  projs as (
    select p.* from aec_projects p
     where not coalesce(p.is_demo, false)
       and (lower(p.campus_name) in (select n from names)
         or lower(p.owner_name) in (select n from names)
         or exists (select 1 from names where length(n) >= 8 and p.name ilike '%' || n || '%'))
  ),
  proj_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'slug', p.slug, 'name', p.name, 'city', p.city, 'state', p.state, 'country', p.country,
      'project_type', p.project_type, 'year', coalesce(p.completion_year, p.opened_year), 'status', p.status,
      'images', (select coalesce(jsonb_agg(jsonb_build_object('url', i.image_url, 'caption', i.caption) order by i.is_hero desc, i.sort_order), '[]'::jsonb) from project_images i where i.project_id = p.id),
      'firms', (select coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'slug', f.slug, 'role', pf.role)), '[]'::jsonb) from project_firms pf join firms f on f.id = pf.firm_id where pf.project_id = p.id)
    ) order by coalesce(p.completion_year, p.opened_year) desc nulls last, p.name), '[]'::jsonb) as j
    from projs p
  ),
  campus_firms as (
    select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'slug', x.slug, 'logo_url', x.logo_url, 'projects', x.cnt) order by x.cnt desc, x.name), '[]'::jsonb) as j
    from (select f.name, f.slug, f.logo_url, count(distinct pf.project_id) as cnt
            from project_firms pf join firms f on f.id = pf.firm_id
           where pf.project_id in (select id from projs) group by f.name, f.slug, f.logo_url) x
  ),
  alumni as (
    select distinct on (pr.id) pr.id, pr.display_name, pr.avatar_url, pr.title,
           coalesce(ct.organization, pr.primary_affiliation_name) as firm_name
      from profile_education e
      join profiles pr on pr.id = e.user_id
      left join lateral (select c.organization from career_timeline c
                          where c.user_id = pr.id and c.end_date is null and length(trim(c.organization)) > 0
                          order by c.start_date desc nulls last limit 1) ct on true
     where e.discoverable and lower(trim(e.institution_name)) in (select n from names)
       and coalesce(pr.discoverable, true) and coalesce(pr.is_public, true) and pr.display_name is not null
  ),
  alumni_matched as (
    select a.*, f.name as firm_display, f.slug as firm_slug
      from alumni a left join firms f on f.id = public.drawup_match_firm(a.firm_name)
     where length(trim(a.firm_name)) > 0
  ),
  alumni_firms as (
    select coalesce(jsonb_agg(jsonb_build_object('firm', y.firm, 'slug', y.slug, 'count', y.cnt, 'people', y.people) order by y.cnt desc, y.firm), '[]'::jsonb) as j
    from (select coalesce(m.firm_display, m.firm_name) as firm, max(m.firm_slug) as slug, count(*) as cnt,
                 to_jsonb((array_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'avatar_url', m.avatar_url, 'title', m.title) order by m.display_name))[1:6]) as people
            from alumni_matched m group by coalesce(m.firm_display, m.firm_name)) y
  ),
  posts as (
    select coalesce(jsonb_agg(jsonb_build_object('id', cp.id, 'kind', cp.kind, 'title', cp.title, 'body', left(cp.body, 600),
             'images', to_jsonb(coalesce(cp.image_urls, array[]::text[])), 'created_at', cp.created_at,
             'author', pr.display_name, 'author_id', pr.id) order by cp.created_at desc), '[]'::jsonb) as j
      from (select * from connect_posts c where lower(trim(c.university_name)) in (select n from names) order by c.created_at desc limit 40) cp
      left join profiles pr on pr.id = cp.author_id
  )
  select jsonb_build_object(
    'projects', (select j from proj_json),
    'firms', (select j from campus_firms),
    'alumni_firms', (select j from alumni_firms),
    'alumni_count', (select count(*) from alumni),
    'posts', (select j from posts))
$$;

revoke all on function public.drawup_university_profile(text[]) from public;
grant execute on function public.drawup_university_profile(text[]) to anon, authenticated;
